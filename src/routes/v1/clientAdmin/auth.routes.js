const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requireRole } = require('../../../middlewares/rbac');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const { authRateLimiter } = require('../../../middlewares/rateLimiter');
const controller = require('../../../controllers/clientAdmin/auth.controller');
const {
  clientAdminLoginSchema,
  refreshTokenSchema,
  logoutSchema,
  forgotPasswordSchema,
  adminResetPasswordSchema,
} = require('../../../validators/auth.validators');

const router = Router();

// Client Admin login resolves its tenant from the request's domain, the
// same way the storefront does — the admin panel is served per-tenant
// (e.g. acme.myplatform.com/admin), which also resolves the "same email,
// different store" ambiguity a global lookup would create.
router.post(
  '/login',
  resolveTenantFromDomain,
  authRateLimiter,
  validateRequest({ body: clientAdminLoginSchema }),
  controller.login
);
router.post('/refresh', validateRequest({ body: refreshTokenSchema }), controller.refresh);
router.post(
  '/logout',
  authenticate,
  requirePersona('admin'),
  requireRole('owner', 'manager', 'support_staff'),
  validateRequest({ body: logoutSchema }),
  controller.logout
);
router.post(
  '/forgot-password',
  resolveTenantFromDomain,
  authRateLimiter,
  validateRequest({ body: forgotPasswordSchema }),
  controller.forgotPassword
);
router.post(
  '/reset-password',
  authRateLimiter,
  validateRequest({ body: adminResetPasswordSchema }),
  controller.resetPassword
);

module.exports = router;
