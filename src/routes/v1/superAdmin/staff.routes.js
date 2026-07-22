const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requireRole } = require('../../../middlewares/rbac');
const controller = require('../../../controllers/superAdmin/staff.controller');
const { createPlatformStaffSchema, userIdParamsSchema } = require('../../../validators/superAdmin.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), requireRole('super_admin'));

router.post('/', validateRequest({ body: createPlatformStaffSchema }), controller.create);
router.get('/', controller.list);
router.patch('/:userId/deactivate', validateRequest({ params: userIdParamsSchema }), controller.deactivate);

module.exports = router;
