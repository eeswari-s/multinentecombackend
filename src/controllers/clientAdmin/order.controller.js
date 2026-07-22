const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const orderService = require('../../services/orderService');

const list = asyncHandler(async (req, res) => {
  const result = await orderService.listOrdersForAdmin(req.query);
  sendSuccess(res, { data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderForAdmin(req.params.id);
  sendSuccess(res, { data: order });
});

const updateStatus = asyncHandler(async (req, res) => {
  const order = await orderService.updateOrderStatus({
    orderId: req.params.id,
    status: req.body.status,
    actor: { userId: req.auth.userId, email: req.auth.email },
  });
  sendSuccess(res, { message: 'Order status updated', data: order });
});

const refund = asyncHandler(async (req, res) => {
  const order = await orderService.refundOrder({
    orderId: req.params.id,
    amount: req.body.amount,
    reason: req.body.reason,
    actor: { userId: req.auth.userId, email: req.auth.email },
  });
  sendSuccess(res, { message: 'Refund issued', data: order });
});

module.exports = { list, getOne, updateStatus, refund };
