const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const newsletterService = require('../../services/customer/newsletterService');

const subscribe = asyncHandler(async (req, res) => {
  await newsletterService.subscribe(req.body.email);
  sendSuccess(res, { statusCode: 201, message: 'Subscribed to newsletter' });
});

const unsubscribe = asyncHandler(async (req, res) => {
  await newsletterService.unsubscribe(req.body.email);
  sendSuccess(res, { message: 'Unsubscribed from newsletter' });
});

module.exports = { subscribe, unsubscribe };
