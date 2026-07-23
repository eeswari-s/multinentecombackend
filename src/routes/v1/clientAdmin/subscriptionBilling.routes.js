const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/subscriptionBilling.controller');
const {
  initiatePaymentSchema,
  verifyPaymentSchema,
  listInvoicesQuerySchema,
} = require('../../../validators/subscriptionBilling.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('settings:subscription'));

router.get('/', controller.getCurrent);
router.post('/checkout', validateRequest({ body: initiatePaymentSchema }), controller.checkout);
router.post('/verify-payment', validateRequest({ body: verifyPaymentSchema }), controller.verifyPayment);
router.get('/invoices', validateRequest({ query: listInvoicesQuerySchema }), controller.listInvoices);

module.exports = router;
