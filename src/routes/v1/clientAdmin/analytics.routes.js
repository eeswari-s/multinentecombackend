const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/analytics.controller');
const { analyticsQuerySchema } = require('../../../validators/analytics.validators');

const router = Router();

// Analytics are platform-controlled — only reachable via Super Admin's
// "Login As Client" impersonation (see rbac.js requirePermission's bypass).
router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('reports:read'));

router.get('/summary', validateRequest({ query: analyticsQuerySchema }), controller.getSummary);

module.exports = router;
