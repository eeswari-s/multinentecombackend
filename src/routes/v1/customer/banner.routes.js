const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/banner.controller');
const { listBannersQuerySchema } = require('../../../validators/banner.validators');

const router = Router();

router.get('/', resolveTenantFromDomain, validateRequest({ query: listBannersQuerySchema }), controller.list);

module.exports = router;
