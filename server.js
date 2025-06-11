// server.js
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config();

const {
  DB_HOST = 'localhost',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'MyDatabase',
  PORT = 5000
} = process.env;

async function ensureDbAndTable() {
  // 1) Connect WITHOUT a database
  const adminConn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD
  });

  // 2) Create the database if it doesn't exist
  await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
  console.log(`✅ Database ensured: ${DB_NAME}`);

  // 3) Switch to the new database
  await adminConn.changeUser({ database: DB_NAME });

  // 4) Create the dim_Product table if missing
  await adminConn.query(`
    CREATE TABLE IF NOT EXISTS dim_Product (
      id INT PRIMARY KEY,
      name VARCHAR(100),
      category VARCHAR(100),
      price FLOAT,
      adjustment FLOAT
    );
  `);

  // 5) Seed sample rows if empty
  await adminConn.query(`
    INSERT INTO dim_Product (id, name, category, price, adjustment)
    SELECT 1, 'Product A', 'Category 1', 100.0, 0.0
    WHERE NOT EXISTS (SELECT 1 FROM dim_Product WHERE id = 1);
  `);
  await adminConn.query(`
    INSERT INTO dim_Product (id, name, category, price, adjustment)
    SELECT 2, 'Product B', 'Category 2', 200.0, 0.0
    WHERE NOT EXISTS (SELECT 1 FROM dim_Product WHERE id = 2);
  `);

  await adminConn.end();
  console.log(`✅ Table & seed data ready.`);
}

(async () => {
  // Ensure DB + Table
  try {
    await ensureDbAndTable();
  } catch (err) {
    console.error('Initialization error:', err);
    process.exit(1);
  }

  // 6) Create a pool pointing at your (now-existing) database
  const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
  });

  // 7) Set up Express
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Fetch table schema
  app.get('/api/schema', async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'dim_Product'
      `);
      const schema = {
        columns: rows.map(col => ({
          headerName: col.COLUMN_NAME,
          field: col.COLUMN_NAME,
          dataType: ['int','float','double','decimal'].includes(col.DATA_TYPE) ? 'float' : 'string',
          editable: col.COLUMN_NAME === 'adjustment'
        }))
      };
      res.json(schema);
    } catch (err) {
      console.error('Schema error:', err);
      res.status(500).send('Error fetching schema');
    }
  });

  // Fetch all data
  app.get('/api/data', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM dim_Product');
      res.json(rows);
    } catch (err) {
      console.error('Data error:', err);
      res.status(500).send('Error fetching data');
    }
  });

  // Save updates
  app.post('/api/save', async (req, res) => {
    try {
      const updates = req.body;
      const conn = await pool.getConnection();
      for (const { id, adjustment } of updates) {
        await conn.query(
          `UPDATE dim_Product SET adjustment = ? WHERE id = ?`,
          [adjustment, id]
        );
      }
      conn.release();
      res.sendStatus(200);
    } catch (err) {
      console.error('Save error:', err);
      res.status(500).send('Error saving data');
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
  });
})();
