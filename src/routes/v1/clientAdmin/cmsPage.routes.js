const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/cmsPage.controller');
const {
  createCmsPageSchema,
  updateCmsPageSchema,
  listCmsPagesQuerySchema,
  cmsPageIdParamsSchema,
} = require('../../../validators/cmsPage.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth);

router.post('/', requirePermission('cms:write'), validateRequest({ body: createCmsPageSchema }), controller.create);
router.get('/', requirePermission('catalog:read'), validateRequest({ query: listCmsPagesQuerySchema }), controller.list);
router.get(
  '/:id',
  requirePermission('catalog:read'),
  validateRequest({ params: cmsPageIdParamsSchema }),
  controller.getOne
);
router.patch(
  '/:id',
  requirePermission('cms:write'),
  validateRequest({ params: cmsPageIdParamsSchema, body: updateCmsPageSchema }),
  controller.update
);
router.delete(
  '/:id',
  requirePermission('cms:write'),
  validateRequest({ params: cmsPageIdParamsSchema }),
  controller.remove
);

module.exports = router;
