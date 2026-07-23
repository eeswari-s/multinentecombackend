const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const upload = require('../../../middlewares/upload');
const controller = require('../../../controllers/clientAdmin/storeSettings.controller');
const { updateBrandingSchema, updateShippingSettingsSchema } = require('../../../validators/storeSettings.validators');
const { setCustomDomainSchema } = require('../../../validators/customDomain.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth);

// Branding and custom domain are platform-controlled — only reachable via
// Super Admin's "Login As Client" impersonation (see rbac.js). Shipping
// stays with the tenant.
router.get('/branding', requirePermission('settings:branding'), controller.getBranding);
router.put(
  '/branding',
  requirePermission('settings:branding'),
  upload.single('logo'),
  validateRequest({ body: updateBrandingSchema }),
  controller.updateBranding
);
router.get('/shipping', requirePermission('settings:shipping'), controller.getShipping);
router.put(
  '/shipping',
  requirePermission('settings:shipping'),
  validateRequest({ body: updateShippingSettingsSchema }),
  controller.updateShipping
);

router.get('/custom-domain', requirePermission('settings:domain'), controller.getCustomDomain);
router.post(
  '/custom-domain',
  requirePermission('settings:domain'),
  validateRequest({ body: setCustomDomainSchema }),
  controller.setCustomDomain
);
router.post('/custom-domain/verify', requirePermission('settings:domain'), controller.verifyCustomDomain);
router.delete('/custom-domain', requirePermission('settings:domain'), controller.removeCustomDomain);

module.exports = router;
