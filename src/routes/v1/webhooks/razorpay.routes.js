const { Router } = require('express');
const { resolveTenantFromParam } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/webhooks/razorpay.controller');

const router = Router();

// Each tenant configures https://api.yourplatform.com/api/v1/webhooks/razorpay/:tenantId
// as their OWN webhook URL in their OWN Razorpay dashboard.
router.post('/:tenantId', resolveTenantFromParam('tenantId'), controller.handle);

module.exports = router;
