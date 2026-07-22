const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const orderService = require('../../services/orderService');
const cartService = require('../../services/customer/cartService');

const list = asyncHandler(async (req, res) => {
  const result = await orderService.listCustomerOrders(req.auth.userId, req.query);
  sendSuccess(res, { data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const order = await orderService.getCustomerOrder(req.auth.userId, req.params.id);
  sendSuccess(res, { data: order });
});

const cancel = asyncHandler(async (req, res) => {
  const order = await orderService.cancelCustomerOrder({
    customerId: req.auth.userId,
    orderId: req.params.id,
    reason: req.body.reason,
  });
  sendSuccess(res, { message: 'Order cancelled', data: order });
});

const buyAgain = asyncHandler(async (req, res) => {
  const result = await cartService.buyAgain({ customerId: req.auth.userId, orderId: req.params.id });
  sendSuccess(res, { message: 'Items added to cart', data: result });
});

module.exports = { list, getOne, cancel, buyAgain };
