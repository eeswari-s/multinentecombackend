const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/newsletter.controller');
const { listSubscribersQuerySchema } = require('../../../validators/newsletter.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('notifications:manage'));

router.get('/subscribers', validateRequest({ query: listSubscribersQuerySchema }), controller.list);

module.exports = router;
