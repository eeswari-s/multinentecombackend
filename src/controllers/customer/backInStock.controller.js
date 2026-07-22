const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const backInStockService = require('../../services/customer/backInStockService');
const { Customer } = require('../../models/customer.model');

const subscribe = asyncHandler(async (req, res) => {
  let email = req.body.email;
  if (!email) {
    const customer = await Customer.findById(req.auth.userId).select('email').lean();
    email = customer.email;
  }

  const subscription = await backInStockService.subscribe({
    customerId: req.auth.userId,
    productId: req.body.productId,
    sku: req.body.sku,
    email,
  });
  sendSuccess(res, { statusCode: 201, message: 'You will be notified when this is back in stock', data: subscription });
});

const unsubscribe = asyncHandler(async (req, res) => {
  await backInStockService.unsubscribe({
    customerId: req.auth.userId,
    productId: req.query.productId,
    sku: req.query.sku,
  });
  sendSuccess(res, { message: 'Notification cancelled' });
});

const list = asyncHandler(async (req, res) => {
  const subscriptions = await backInStockService.listMySubscriptions(req.auth.userId);
  sendSuccess(res, { data: subscriptions });
});

module.exports = { subscribe, unsubscribe, list };
