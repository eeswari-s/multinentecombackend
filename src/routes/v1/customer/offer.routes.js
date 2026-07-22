const { Router } = require('express');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/offer.controller');

const router = Router();

router.get('/', resolveTenantFromDomain, controller.list);

module.exports = router;
