const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const upload = require('../../../middlewares/upload');
const controller = require('../../../controllers/clientAdmin/product.controller');
const {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  productIdParamsSchema,
  productImageParamsSchema,
  setProductStatusSchema,
  bulkStatusSchema,
  bulkCategorySchema,
} = require('../../../validators/catalog.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth);

router.post('/', requirePermission('catalog:write'), validateRequest({ body: createProductSchema }), controller.create);
router.get('/', requirePermission('catalog:read'), validateRequest({ query: listProductsQuerySchema }), controller.list);

router.patch(
  '/bulk/status',
  requirePermission('catalog:write'),
  validateRequest({ body: bulkStatusSchema }),
  controller.bulkStatus
);
router.patch(
  '/bulk/category',
  requirePermission('catalog:write'),
  validateRequest({ body: bulkCategorySchema }),
  controller.bulkCategory
);

router.get('/:id', requirePermission('catalog:read'), validateRequest({ params: productIdParamsSchema }), controller.getOne);
router.patch(
  '/:id',
  requirePermission('catalog:write'),
  validateRequest({ params: productIdParamsSchema, body: updateProductSchema }),
  controller.update
);
router.patch(
  '/:id/status',
  requirePermission('catalog:write'),
  validateRequest({ params: productIdParamsSchema, body: setProductStatusSchema }),
  controller.setStatus
);
router.post(
  '/:id/duplicate',
  requirePermission('catalog:write'),
  validateRequest({ params: productIdParamsSchema }),
  controller.duplicate
);
router.post(
  '/:id/images',
  requirePermission('catalog:write'),
  validateRequest({ params: productIdParamsSchema }),
  upload.array('images', 10),
  controller.addImages
);
router.delete(
  '/:id/images/:imageId',
  requirePermission('catalog:write'),
  validateRequest({ params: productImageParamsSchema }),
  controller.removeImage
);
router.delete(
  '/:id',
  requirePermission('catalog:write'),
  validateRequest({ params: productIdParamsSchema }),
  controller.remove
);

module.exports = router;
