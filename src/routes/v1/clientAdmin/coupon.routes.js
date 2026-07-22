const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/coupon.controller');
const {
  createCouponSchema,
  updateCouponSchema,
  listCouponsQuerySchema,
  couponIdParamsSchema,
} = require('../../../validators/coupon.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth);

router.post('/', requirePermission('coupons:write'), validateRequest({ body: createCouponSchema }), controller.create);
router.get('/', requirePermission('coupons:read'), validateRequest({ query: listCouponsQuerySchema }), controller.list);
router.patch(
  '/:id',
  requirePermission('coupons:write'),
  validateRequest({ params: couponIdParamsSchema, body: updateCouponSchema }),
  controller.update
);
router.delete(
  '/:id',
  requirePermission('coupons:write'),
  validateRequest({ params: couponIdParamsSchema }),
  controller.remove
);

module.exports = router;
