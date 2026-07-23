const ApiError = require('../utils/ApiError');
const { hasPermission } = require('../config/permissions');

function requireRole(...allowedRoles) {
  return function checkRole(req, res, next) {
    if (!req.auth || !allowedRoles.includes(req.auth.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
}

function requirePermission(permission) {
  return function checkPermission(req, res, next) {
    if (!req.auth) return next(ApiError.forbidden('You do not have permission to perform this action'));
    // A Super Admin "Login As Client" session carries the tenant owner's own
    // role/permissions, which no longer include the settings/staff/reporting
    // permissions reserved for platform control — bypass so impersonation
    // remains the one path into those screens.
    if (req.auth.impersonation?.active) return next();
    if (!hasPermission(req.auth.role, permission)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
}

module.exports = { requireRole, requirePermission };
