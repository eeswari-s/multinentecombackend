const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requireRole } = require('../../../middlewares/rbac');
const controller = require('../../../controllers/superAdmin/platformSettings.controller');
const { updatePlatformSettingsSchema } = require('../../../validators/platformSettings.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), requireRole('super_admin'));

router.get('/', controller.get);
router.patch('/', validateRequest({ body: updatePlatformSettingsSchema }), controller.update);

module.exports = router;
