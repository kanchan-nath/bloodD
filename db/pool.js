const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

function buildDbConfig() {
  let host = process.env.DB_HOST || '127.0.0.1';
  let port = parseInt(process.env.DB_PORT, 10) || 3306;
  let user = process.env.DB_USER || 'root';
  let password = process.env.DB_PASSWORD || '';
  let database = process.env.DB_NAME || 'blood_bank_demo';

  // Support DATABASE_URL / standard connection string (Render, TiDB Cloud, etc.)
  if (process.env.DATABASE_URL) {
    try {
      const parsed = new URL(process.env.DATABASE_URL);
      host = parsed.hostname || host;
      port = parsed.port ? parseInt(parsed.port, 10) : port;
      user = parsed.username ? decodeURIComponent(parsed.username) : user;
      password = parsed.password ? decodeURIComponent(parsed.password) : password;

      const pathDb = parsed.pathname ? parsed.pathname.replace(/^\//, '') : '';
      if (pathDb && pathDb !== 'sys') {
        database = pathDb;
      } else if (process.env.DB_NAME) {
        database = process.env.DB_NAME;
      }
    } catch (err) {
      console.warn('[DB Config] Could not parse DATABASE_URL as URL, using default credentials:', err.message);
    }
  }

  // Detect SSL requirement for cloud-hosted databases (e.g. TiDB Cloud)
  const isCloudHost = host.includes('tidbcloud.com') || host.includes('rds.amazonaws.com') || host.includes('aivencloud.com');
  const useSSL = process.env.DB_SSL === 'true' || (process.env.DB_SSL !== 'false' && isCloudHost);

  const config = {
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    dateStrings: true // Keep dates as 'YYYY-MM-DD' strings for consistent form handling
  };

  if (useSSL) {
    config.ssl = {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    };
  }

  return config;
}

const dbConfig = buildDbConfig();
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
    console.log(`[DB] Successfully connected to MySQL at ${dbConfig.host}:${dbConfig.port}, Database: ${rows[0].db_name} (SSL: ${Boolean(dbConfig.ssl)})`);
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
