/**
 * Database Initialization Script
 * Runs blood_bank_management.sql against the configured database (local or TiDB Cloud).
 * Usage: npm run db:init
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { dbConfig } = require('./pool');

async function initializeDatabase() {
  console.log('========================================================================');
  console.log(`[DB Init] Initializing database at ${dbConfig.host}:${dbConfig.port}...`);
  console.log(`[DB Init] Target database: ${dbConfig.database} (SSL: ${Boolean(dbConfig.ssl)})`);
  console.log('========================================================================');

  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: dbConfig.ssl,
    multipleStatements: true
  });

  try {
    const sqlFilePath = path.join(__dirname, '..', 'blood_bank_management.sql');
    if (!fs.existsSync(sqlFilePath)) {
      throw new Error(`Schema file not found at: ${sqlFilePath}`);
    }

    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    console.log('[DB Init] Executing schema DDL and seed datasets...');
    await connection.query(sqlContent);

    // Verify created objects
    const [tables] = await connection.query(`SHOW TABLES IN \`${dbConfig.database}\``);
    const [userRows] = await connection.query(`SELECT COUNT(*) as count FROM \`${dbConfig.database}\`.users`);
    const [donorRows] = await connection.query(`SELECT COUNT(*) as count FROM \`${dbConfig.database}\`.donors`);
    const [batchRows] = await connection.query(`SELECT COUNT(*) as count FROM \`${dbConfig.database}\`.blood_inventory_batches`);

    console.log(`[DB Init] Success! Initialized ${tables.length} database tables & views.`);
    console.log(`[DB Init] Records seeded: ${userRows[0].count} users, ${donorRows[0].count} donors, ${batchRows[0].count} inventory batches.`);
    console.log('========================================================================');
  } catch (error) {
    console.error('[DB Init Error] Failed to initialize database:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };

