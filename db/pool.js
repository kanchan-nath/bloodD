const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'blood_bank_demo',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  dateStrings: true // Keep dates as 'YYYY-MM-DD' strings for consistent form handling
};

const pool = mysql.createPool(dbConfig);

/**
 * Test the database connection and log connection info.
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT 1 AS connected, DATABASE() as db_name');
    connection.release();
    console.log(`[DB] Successfully connected to MySQL at ${dbConfig.host}:${dbConfig.port}, Database: ${rows[0].db_name}`);
    return true;
  } catch (error) {
    console.error(`[DB Error] Failed to connect to MySQL (${dbConfig.host}:${dbConfig.port}):`, error.message);
    return false;
  }
}

module.exports = {
  pool,
  dbConfig,
  testConnection
};
