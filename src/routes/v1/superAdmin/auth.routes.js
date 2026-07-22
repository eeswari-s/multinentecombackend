const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requireRole } = require('../../../middlewares/rbac');
const { superAdminAuthRateLimiter } = require('../../../middlewares/rateLimiter');
const controller = require('../../../controllers/superAdmin/auth.controller');
const {
  superAdminLoginSchema,
  refreshTokenSchema,
  logoutSchema,
  forgotPasswordSchema,
  adminResetPasswordSchema,
} = require('../../../validators/auth.validators');

const router = Router();

router.post(
  '/login',
  superAdminAuthRateLimiter,
  validateRequest({ body: superAdminLoginSchema }),
  controller.login
);
router.post('/refresh', validateRequest({ body: refreshTokenSchema }), controller.refresh);
router.post(
  '/logout',
  authenticate,
  requirePersona('admin'),
  requireRole('super_admin'),
  validateRequest({ body: logoutSchema }),
  controller.logout
);
router.post(
  '/forgot-password',
  superAdminAuthRateLimiter,
  validateRequest({ body: forgotPasswordSchema }),
  controller.forgotPassword
);
router.post('/reset-password', superAdminAuthRateLimiter, validateRequest({ body: adminResetPasswordSchema }), controller.resetPassword);

module.exports = router;
