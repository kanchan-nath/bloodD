const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../db/pool');
const { verifyPassword } = require('../utils/crypto');

test.after(async () => {
  await pool.end();
});

test('Database Connection & Seeded Users Verification', async () => {
  const [users] = await pool.query('SELECT username, password_hash, role FROM users');
  assert.ok(users.length >= 2, 'Should have at least 2 demo users');

  const admin = users.find(u => u.username === 'admin');
  assert.ok(admin, 'Admin user must exist');
  assert.equal(admin.role, 'ADMIN');
  assert.equal(verifyPassword('Admin@123', admin.password_hash), true, 'Admin password must verify');

  const staff = users.find(u => u.username === 'staff');
  assert.ok(staff, 'Staff user must exist');
  assert.equal(staff.role, 'STAFF');
  assert.equal(verifyPassword('Staff@123', staff.password_hash), true, 'Staff password must verify');
});

test('Database View v_current_blood_stock is functioning', async () => {
  const [rows] = await pool.query('SELECT blood_group, available_units FROM v_current_blood_stock');
  assert.ok(Array.isArray(rows), 'View query should return array of rows');
  rows.forEach(r => {
    assert.ok(typeof r.blood_group === 'string');
    assert.ok(Number(r.available_units) >= 0);
  });
});

test('Referential Integrity check prevents deletion of donor with donations', async () => {
  const [[{ donation_count }]] = await pool.query(
    'SELECT COUNT(*) AS donation_count FROM donations WHERE donor_id = ?',
    [1]
  );
  assert.ok(donation_count > 0, 'Donor #1 should have existing donations');

  let caught = false;
  try {
    await pool.query('DELETE FROM donors WHERE donor_id = 1');
  } catch (err) {
    caught = true;
    assert.match(err.message, /foreign key|constraint|REFERENCES/i);
  }
  assert.ok(caught, 'Foreign key constraint must prevent deleting donor with donations');
});

test('FIFO stock issue query returns batches sorted by earliest expiry first', async () => {
  const [batches] = await pool.query(
    `SELECT batch_id, batch_code, blood_group, expiry_date 
     FROM blood_inventory_batches 
     WHERE status = 'AVAILABLE' AND units_available > 0 AND expiry_date >= CURDATE()
     ORDER BY expiry_date ASC, batch_id ASC`
  );

  assert.ok(batches.length > 0, 'Should have available batches in seed dataset');
  for (let i = 0; i < batches.length - 1; i++) {
    const curDate = new Date(batches[i].expiry_date);
    const nextDate = new Date(batches[i + 1].expiry_date);
    assert.ok(curDate <= nextDate, 'Batches must be strictly sorted by earliest expiry date first');
  }
});

test('Healthcheck endpoint /healthz responds with database connected', async () => {
  const app = require('../server');
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.database, 'connected');
  } finally {
    server.close();
  }
});
