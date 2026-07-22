const { Router } = require('express');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/coupon.controller');

const router = Router();

router.get('/', resolveTenantFromDomain, controller.list);

module.exports = router;
