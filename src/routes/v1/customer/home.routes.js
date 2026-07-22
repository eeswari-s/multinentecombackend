const { Router } = require('express');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/home.controller');

const router = Router();

router.get('/', resolveTenantFromDomain, controller.getHome);

module.exports = router;
