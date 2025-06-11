// initDb.js
const sql = require('mssql');
require('dotenv').config();

const dbName = process.env.DB_NAME || 'MyDatabase';

const baseConfig = {
  user: 'sa', // or your SQL user
  password: 'Fayolove2',
  server: 'localhost',
  database: 'master', // always start from master to create new DB
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function createDatabaseAndTable() {
  try {
    // Connect to 'master' to create the DB
    const pool = await sql.connect(baseConfig);

    // Ensure database exists
    await pool.request().query(`IF DB_ID('${dbName}') IS NULL CREATE DATABASE [${dbName}];`);
    console.log(`✅ Database '${dbName}' ensured.`);

    // Now connect to the new database
    const dbConfig = {
      ...baseConfig,
      database: dbName
    };
    const dbPool = await sql.connect(dbConfig);

    // Create table if not exists
    await dbPool.request().query(`
      IF OBJECT_ID('dim_Product', 'U') IS NULL
      CREATE TABLE dim_Product (
        id INT PRIMARY KEY,
        name NVARCHAR(100),
        category NVARCHAR(100),
        price FLOAT,
        adjustment FLOAT
      );
    `);

    // Seed data if empty
    await dbPool.request().query(`
      IF NOT EXISTS (SELECT * FROM dim_Product)
      BEGIN
        INSERT INTO dim_Product (id, name, category, price, adjustment)
        VALUES
        (1, 'Product A', 'Category 1', 100.0, 0.0),
        (2, 'Product B', 'Category 2', 200.0, 0.0);
      END
    `);

    console.log('✅ Table and sample data created.');
    sql.close();
  } catch (err) {
    console.error('❌ Initialization failed:', err);
  }
}

createDatabaseAndTable();
