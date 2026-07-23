const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/brevoConfig.controller');
const { saveBrevoConfigSchema } = require('../../../validators/brevoConfig.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('settings:email'));

router.put('/', validateRequest({ body: saveBrevoConfigSchema }), controller.save);
router.get('/', controller.get);

module.exports = router;
