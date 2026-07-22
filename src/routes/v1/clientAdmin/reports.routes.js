const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/pdf.controller');
const reconciliationController = require('../../../controllers/clientAdmin/reconciliation.controller');
const { documentIdParamsSchema, reportQuerySchema } = require('../../../validators/pdf.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('reports:read'));

router.post('/sales', validateRequest({ query: reportQuerySchema }), controller.salesReport);
router.post('/revenue', validateRequest({ query: reportQuerySchema }), controller.revenueReport);
router.post('/customers', validateRequest({ query: reportQuerySchema }), controller.customerReport);
router.post('/inventory', controller.inventoryReport);
router.post('/analytics', validateRequest({ query: reportQuerySchema }), controller.analyticsReport);

router.get('/documents/:id', validateRequest({ params: documentIdParamsSchema }), controller.getDocument);
router.get('/reconciliation', validateRequest({ query: reportQuerySchema }), reconciliationController.getReconciliation);

module.exports = router;
