const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPassword, hashPassword } = require('../utils/crypto');

test('Werkzeug PBKDF2 hash verification for admin', () => {
  const adminHash = 'pbkdf2:sha256:600000$6d95954d2d6ebc71$f6fba0b53e1f0067b19d4df709cd5d44b05425555231971999b9e8fc22cd3867';
  assert.equal(verifyPassword('Admin@123', adminHash), true, 'Admin password should verify');
  assert.equal(verifyPassword('WrongPass', adminHash), false, 'Wrong password should fail');
});

test('Werkzeug PBKDF2 hash verification for staff', () => {
  const staffHash = 'pbkdf2:sha256:600000$9d589b11dfc01f56$8f3f592f4f63705df96f29b7e8f4f6d5812a5a1c998758f9b5c4f1360e189349';
  assert.equal(verifyPassword('Staff@123', staffHash), true, 'Staff password should verify');
  assert.equal(verifyPassword('staff@123', staffHash), false, 'Case-sensitive password should fail');
});

test('Hash generation and round-trip verification', () => {
  const plain = 'SecretDemoPass#2026';
  const hashed = hashPassword(plain, 100000); // 100k for faster test execution
  assert.match(hashed, /^pbkdf2:sha256:\d+\$[0-9a-f]{16}\$[0-9a-f]{64}$/);
  assert.equal(verifyPassword(plain, hashed), true, 'Newly generated hash should verify');
  assert.equal(verifyPassword('incorrect', hashed), false, 'Incorrect password should fail verification');
});
