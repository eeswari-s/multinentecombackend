const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/cart.controller');
const {
  addItemSchema,
  itemIdParamsSchema,
  updateItemBodySchema,
  savedItemIdParamsSchema,
  moveToCartBodySchema,
} = require('../../../validators/cart.validators');
const { applyCouponSchema } = require('../../../validators/coupon.validators');

const router = Router();

router.use(resolveTenantFromDomain, authenticate, requirePersona('customer'));

router.get('/', controller.getCart);
router.post('/items', validateRequest({ body: addItemSchema }), controller.addItem);
router.patch(
  '/items/:itemId',
  validateRequest({ params: itemIdParamsSchema, body: updateItemBodySchema }),
  controller.updateItem
);
router.delete('/items/:itemId', validateRequest({ params: itemIdParamsSchema }), controller.removeItem);
router.post('/coupon', validateRequest({ body: applyCouponSchema }), controller.applyCoupon);
router.delete('/coupon', controller.removeCoupon);

router.post('/items/:itemId/save-for-later', validateRequest({ params: itemIdParamsSchema }), controller.saveForLater);
router.get('/saved-items', controller.listSaved);
router.post(
  '/saved-items/:savedItemId/move-to-cart',
  validateRequest({ params: savedItemIdParamsSchema, body: moveToCartBodySchema }),
  controller.moveToCart
);
router.delete('/saved-items/:savedItemId', validateRequest({ params: savedItemIdParamsSchema }), controller.removeSaved);

module.exports = router;
