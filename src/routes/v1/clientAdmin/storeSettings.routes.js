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

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('settings:manage'));

router.get('/branding', controller.getBranding);
router.put('/branding', upload.single('logo'), validateRequest({ body: updateBrandingSchema }), controller.updateBranding);
router.get('/shipping', controller.getShipping);
router.put('/shipping', validateRequest({ body: updateShippingSettingsSchema }), controller.updateShipping);

router.get('/custom-domain', controller.getCustomDomain);
router.post('/custom-domain', validateRequest({ body: setCustomDomainSchema }), controller.setCustomDomain);
router.post('/custom-domain/verify', controller.verifyCustomDomain);
router.delete('/custom-domain', controller.removeCustomDomain);

module.exports = router;
