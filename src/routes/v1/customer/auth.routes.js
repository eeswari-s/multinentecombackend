const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const { authRateLimiter } = require('../../../middlewares/rateLimiter');
const controller = require('../../../controllers/customer/auth.controller');
const {
  customerRegisterSchema,
  customerLoginSchema,
  refreshTokenSchema,
  logoutSchema,
  verifyEmailSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  customerResetPasswordSchema,
} = require('../../../validators/auth.validators');

const router = Router();

router.post(
  '/register',
  resolveTenantFromDomain,
  authRateLimiter,
  validateRequest({ body: customerRegisterSchema }),
  controller.register
);
router.post(
  '/login',
  resolveTenantFromDomain,
  authRateLimiter,
  validateRequest({ body: customerLoginSchema }),
  controller.login
);
router.post(
  '/refresh',
  resolveTenantFromDomain,
  validateRequest({ body: refreshTokenSchema }),
  controller.refresh
);
router.post(
  '/logout',
  resolveTenantFromDomain,
  authenticate,
  requirePersona('customer'),
  validateRequest({ body: logoutSchema }),
  controller.logout
);
router.post(
  '/verify-email',
  resolveTenantFromDomain,
  authRateLimiter,
  validateRequest({ body: verifyEmailSchema }),
  controller.verifyEmail
);
router.post(
  '/resend-otp',
  resolveTenantFromDomain,
  authRateLimiter,
  validateRequest({ body: resendOtpSchema }),
  controller.resendOtp
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
  resolveTenantFromDomain,
  authRateLimiter,
  validateRequest({ body: customerResetPasswordSchema }),
  controller.resetPassword
);

module.exports = router;
