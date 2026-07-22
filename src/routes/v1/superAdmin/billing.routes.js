const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requireRole } = require('../../../middlewares/rbac');
const controller = require('../../../controllers/superAdmin/billing.controller');
const { listInvoicesQuerySchema, reconciliationQuerySchema } = require('../../../validators/subscriptionBilling.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), requireRole('super_admin'));

router.get('/invoices', validateRequest({ query: listInvoicesQuerySchema }), controller.listAll);
router.get('/reconciliation', validateRequest({ query: reconciliationQuerySchema }), controller.reconciliation);

module.exports = router;
