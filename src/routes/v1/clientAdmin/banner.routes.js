const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const upload = require('../../../middlewares/upload');
const controller = require('../../../controllers/clientAdmin/banner.controller');
const {
  createBannerSchema,
  updateBannerSchema,
  listBannersQuerySchema,
  bannerIdParamsSchema,
} = require('../../../validators/banner.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth);

router.post(
  '/',
  requirePermission('banners:write'),
  upload.single('image'),
  validateRequest({ body: createBannerSchema }),
  controller.create
);
router.get('/', requirePermission('catalog:read'), validateRequest({ query: listBannersQuerySchema }), controller.list);
router.patch(
  '/:id',
  requirePermission('banners:write'),
  upload.single('image'),
  validateRequest({ params: bannerIdParamsSchema, body: updateBannerSchema }),
  controller.update
);
router.delete(
  '/:id',
  requirePermission('banners:write'),
  validateRequest({ params: bannerIdParamsSchema }),
  controller.remove
);

module.exports = router;
