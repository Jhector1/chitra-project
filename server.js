// server.js
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');
const path    = require('path');
require('dotenv').config();

const {
  DATABASE_URL,        // Render injects this when you "Connect Database"
  PORT = 5000
} = process.env;

// Create a connection pool using the DATABASE_URL
// On Render you need SSL: rejectUnauthorized false
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function ensureTableAndSeed() {
  // Create table if missing
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dim_product (
      id         INT PRIMARY KEY,
      name       VARCHAR(100),
      category   VARCHAR(100),
      price      REAL,
      adjustment REAL DEFAULT 0
    );
  `);

  // Seed row #1
  await pool.query(`
    INSERT INTO dim_product (id, name, category, price, adjustment)
    SELECT 1, 'Product A', 'Category 1', 100.0, 0.0
    WHERE NOT EXISTS (
      SELECT 1 FROM dim_product WHERE id = 1
    );
  `);

  // Seed row #2
  await pool.query(`
    INSERT INTO dim_product (id, name, category, price, adjustment)
    SELECT 2, 'Product B', 'Category 2', 200.0, 0.0
    WHERE NOT EXISTS (
      SELECT 1 FROM dim_product WHERE id = 2
    );
  `);

  console.log('✅ Table & seed data ready.');
}

(async () => {
  try {
    await ensureTableAndSeed();
  } catch (err) {
    console.error('Initialization error:', err);
    process.exit(1);
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  // ──────────────────────────────────────────────────────
  // API: Get schema
  app.get('/api/schema', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'dim_product';
      `);
      const schema = {
        columns: rows.map(c => ({
          headerName: c.column_name,
          field:      c.column_name,
          dataType:   /int|real/.test(c.data_type) ? 'float' : 'string',
          editable:   c.column_name === 'adjustment'
        }))
      };
      res.json(schema);
    } catch (err) {
      console.error('Schema error:', err);
      res.status(500).send('Error fetching schema');
    }
  });

  // ──────────────────────────────────────────────────────
  // API: Get data
  app.get('/api/data', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM dim_product;');
      res.json(rows);
    } catch (err) {
      console.error('Data error:', err);
      res.status(500).send('Error fetching data');
    }
  });

  // ──────────────────────────────────────────────────────
  // API: Save updates
  app.post('/api/save', async (req, res) => {
    try {
      for (const { id, adjustment } of req.body) {
        await pool.query(
          `UPDATE dim_product SET adjustment = $1 WHERE id = $2;`,
          [adjustment, id]
        );
      }
      res.sendStatus(200);
    } catch (err) {
      console.error('Save error:', err);
      res.status(500).send('Error saving data');
    }
  });

  // ──────────────────────────────────────────────────────
  // Serve your Vite build output from /dist
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });

  // ──────────────────────────────────────────────────────
  // Start the server
  app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
  });

})();
