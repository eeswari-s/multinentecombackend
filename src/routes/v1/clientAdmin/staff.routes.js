const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/staff.controller');
const {
  inviteStaffSchema,
  updateStaffRoleSchema,
  staffIdParamsSchema,
} = require('../../../validators/clientAdmin.validators');

const router = Router();

// Staff management is platform-controlled — a tenant's own login never has
// 'staff:manage'; only Super Admin's "Login As Client" impersonation (see
// rbac.js requirePermission) can reach these routes.
router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('staff:manage'));

router.post('/', validateRequest({ body: inviteStaffSchema }), controller.invite);
router.get('/', controller.list);
router.patch(
  '/:userId/role',
  validateRequest({ params: staffIdParamsSchema, body: updateStaffRoleSchema }),
  controller.updateRole
);
router.patch('/:userId/deactivate', validateRequest({ params: staffIdParamsSchema }), controller.deactivate);

module.exports = router;
