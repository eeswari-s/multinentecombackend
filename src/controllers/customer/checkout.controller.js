const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const checkoutService = require('../../services/customer/checkoutService');

const setShippingAddress = asyncHandler(async (req, res) => {
  const cart = await checkoutService.setShippingAddress({
    customerId: req.auth.userId,
    shippingAddress: req.body,
  });
  sendSuccess(res, { message: 'Shipping address saved', data: cart });
});

const checkout = asyncHandler(async (req, res) => {
  const result = await checkoutService.initiateCheckout({
    customerId: req.auth.userId,
    paymentMethod: req.body.paymentMethod,
  });
  sendSuccess(res, { message: 'Checkout initiated', data: result });
});

const verifyPayment = asyncHandler(async (req, res) => {
  const order = await checkoutService.verifyPayment({ customerId: req.auth.userId, ...req.body });
  sendSuccess(res, { message: 'Payment verified, order confirmed', data: order });
});

module.exports = { setShippingAddress, checkout, verifyPayment };
