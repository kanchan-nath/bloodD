const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { verifyPassword } = require('../utils/crypto');

/**
 * GET /login - Show login form
 */
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', {
    title: 'Sign In'
  });
});

/**
 * POST /login - Process user authentication
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    req.flash('error', 'Username and password are required.');
    return res.redirect('/login');
  }

  try {
    const [rows] = await pool.query(
      'SELECT user_id, full_name, username, password_hash, role, is_active FROM users WHERE username = ? LIMIT 1',
      [username.trim()]
    );

    if (rows.length === 0) {
      req.flash('error', 'Invalid username or password.');
      return res.redirect('/login');
    }

    const user = rows[0];

    if (!user.is_active) {
      req.flash('error', 'This user account is inactive. Please contact an administrator.');
      return res.redirect('/login');
    }

    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid) {
      req.flash('error', 'Invalid username or password.');
      return res.redirect('/login');
    }

    // Regenerate session to prevent session fixation attacks
    const sessionUserData = {
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      role: user.role
    };

    req.session.regenerate((err) => {
      if (err) {
        console.error('[Session Error]', err);
        req.flash('error', 'Session creation failed. Please try again.');
        return res.redirect('/login');
      }

      req.session.user = sessionUserData;
      req.flash('success', `Welcome back, ${user.full_name} (${user.role})!`);
      return res.redirect('/dashboard');
    });
  } catch (error) {
    console.error('[Auth Error]', error);
    req.flash('error', 'An internal error occurred during login. Please try again.');
    res.redirect('/login');
  }
});

/**
 * POST /logout - Sign out user and clear session
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Logout Error]', err);
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
