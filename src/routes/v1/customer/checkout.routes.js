const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/checkout.controller');
const {
  shippingAddressSchema,
  checkoutSchema,
  verifyPaymentSchema,
} = require('../../../validators/cart.validators');

const router = Router();

router.use(resolveTenantFromDomain, authenticate, requirePersona('customer'));

router.put('/shipping-address', validateRequest({ body: shippingAddressSchema }), controller.setShippingAddress);
router.post('/', validateRequest({ body: checkoutSchema }), controller.checkout);
router.post('/verify-payment', validateRequest({ body: verifyPaymentSchema }), controller.verifyPayment);

module.exports = router;
