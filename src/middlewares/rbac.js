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
    if (!req.auth || !hasPermission(req.auth.role, permission)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
}

module.exports = { requireRole, requirePermission };
