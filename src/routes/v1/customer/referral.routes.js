const { Router } = require('express');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/referral.controller');

const router = Router();

router.use(resolveTenantFromDomain, authenticate, requirePersona('customer'));

router.get('/summary', controller.getSummary);

module.exports = router;
