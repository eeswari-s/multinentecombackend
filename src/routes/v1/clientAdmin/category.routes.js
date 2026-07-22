const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const upload = require('../../../middlewares/upload');
const controller = require('../../../controllers/clientAdmin/category.controller');
const {
  createCategorySchema,
  updateCategorySchema,
  listCategoriesQuerySchema,
  categoryIdParamsSchema,
} = require('../../../validators/catalog.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth);

router.post(
  '/',
  requirePermission('catalog:write'),
  validateRequest({ body: createCategorySchema }),
  controller.create
);
router.get('/', requirePermission('catalog:read'), validateRequest({ query: listCategoriesQuerySchema }), controller.list);
router.get(
  '/:id',
  requirePermission('catalog:read'),
  validateRequest({ params: categoryIdParamsSchema }),
  controller.getOne
);
router.patch(
  '/:id',
  requirePermission('catalog:write'),
  validateRequest({ params: categoryIdParamsSchema, body: updateCategorySchema }),
  controller.update
);
router.post(
  '/:id/image',
  requirePermission('catalog:write'),
  validateRequest({ params: categoryIdParamsSchema }),
  upload.single('image'),
  controller.uploadImage
);
router.delete(
  '/:id',
  requirePermission('catalog:write'),
  validateRequest({ params: categoryIdParamsSchema }),
  controller.remove
);

module.exports = router;
