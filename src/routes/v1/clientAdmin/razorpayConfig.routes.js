const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/razorpayConfig.controller');
const { saveRazorpayConfigSchema } = require('../../../validators/razorpayConfig.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('settings:manage'));

router.put('/', validateRequest({ body: saveRazorpayConfigSchema }), controller.save);
router.get('/', controller.get);

module.exports = router;
