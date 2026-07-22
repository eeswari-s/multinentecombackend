const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/cmsPage.controller');
const { cmsPageSlugParamsSchema } = require('../../../validators/cmsPage.validators');

const router = Router();

router.get('/:slug', resolveTenantFromDomain, validateRequest({ params: cmsPageSlugParamsSchema }), controller.getBySlug);

module.exports = router;
