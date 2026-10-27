const crypto = require('crypto');

/**
 * Native session-based CSRF protection middleware.
 * Generates and validates CSRF tokens without deprecated external packages.
 */
function csrfMiddleware(req, res, next) {
  // Ensure session exists
  if (!req.session) {
    return next(new Error('Session must be initialized before CSRF middleware'));
  }

  // Generate token if not already in session
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }

  // Expose token to views
  res.locals.csrfToken = req.session.csrfToken;

  // Safe HTTP methods do not require CSRF token validation
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Validate token on mutating requests
  const clientToken = (req.body && req.body._csrf) ||
                      (req.headers && (req.headers['csrf-token'] || req.headers['x-csrf-token']));

  if (!clientToken || clientToken !== req.session.csrfToken) {
    console.warn(`[Security] CSRF mismatch for ${req.method} ${req.originalUrl}`);
    req.flash('error', 'Security validation failed (Invalid or expired CSRF token). Please try again.');
    return res.status(403).redirect(req.get('Referrer') || '/dashboard');
  }

  next();
}

module.exports = csrfMiddleware;
