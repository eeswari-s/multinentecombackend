const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requireRole } = require('../../../middlewares/rbac');
const controller = require('../../../controllers/superAdmin/platformNotification.controller');
const {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
} = require('../../../validators/platformNotification.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), requireRole('super_admin'));

router.get('/', validateRequest({ query: listNotificationsQuerySchema }), controller.list);
router.patch('/:id/read', validateRequest({ params: notificationIdParamsSchema }), controller.markRead);
router.patch('/read-all', controller.markAllRead);

module.exports = router;
