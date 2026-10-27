/**
 * Authentication and authorization middleware.
 */

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash('error', 'Please log in to access this page.');
  return res.redirect('/login');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please log in to continue.');
      return res.redirect('/login');
    }

    const userRole = req.session.user.role;
    if (roles.includes(userRole) || userRole === 'ADMIN') {
      return next();
    }

    req.flash('error', 'Access denied. You do not have permission to perform this action.');
    return res.status(403).redirect(req.get('Referrer') || '/dashboard');
  };
}

module.exports = {
  requireAuth,
  requireRole
};
