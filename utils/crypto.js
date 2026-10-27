const crypto = require('crypto');

/**
 * Utility functions for Werkzeug-compatible PBKDF2 password hashing.
 * Format: pbkdf2:sha256:600000$salt$hex_digest
 */

/**
 * Verify a plaintext password against a stored Werkzeug-compatible PBKDF2 hash.
 * @param {string} password - Plaintext password input.
 * @param {string} storedHash - Hash from database.
 * @returns {boolean} True if password matches, false otherwise.
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 3) {
    return false;
  }

  const [header, salt, expectedHex] = parts;
  const headerParts = header.split(':');
  if (headerParts.length !== 3 || headerParts[0] !== 'pbkdf2') {
    return false;
  }

  const algorithm = headerParts[1];
  const iterations = parseInt(headerParts[2], 10);

  if (isNaN(iterations) || iterations <= 0) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  const keylen = expectedBuffer.length;

  try {
    const derivedKey = crypto.pbkdf2Sync(
      password,
      salt,
      iterations,
      keylen,
      algorithm
    );

    if (derivedKey.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(derivedKey, expectedBuffer);
  } catch (err) {
    return false;
  }
}

/**
 * Generate a Werkzeug-compatible PBKDF2 hash.
 * @param {string} password - Plaintext password to hash.
 * @param {number} iterations - Number of iterations (default 600,000).
 * @returns {string} Formatted hash string.
 */
function hashPassword(password, iterations = 600000) {
  if (!password) {
    throw new Error('Password is required for hashing');
  }

  const algorithm = 'sha256';
  const salt = crypto.randomBytes(8).toString('hex'); // 16-character hex salt
  const keylen = 32;

  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    keylen,
    algorithm
  );

  return `pbkdf2:${algorithm}:${iterations}$${salt}$${derivedKey.toString('hex')}`;
}

module.exports = {
  verifyPassword,
  hashPassword
};
