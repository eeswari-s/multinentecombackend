const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/inventory.controller');
const { adjustStockSchema, movementsQuerySchema } = require('../../../validators/catalog.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth);

router.post('/adjust', requirePermission('catalog:write'), validateRequest({ body: adjustStockSchema }), controller.adjust);
router.get('/', requirePermission('catalog:read'), validateRequest({ query: movementsQuerySchema }), controller.listMovements);

module.exports = router;
