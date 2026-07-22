const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const razorpayConfigService = require('../../services/clientAdmin/razorpayConfigService');

const save = asyncHandler(async (req, res) => {
  const config = await razorpayConfigService.saveConfig({
    ...req.body,
    actor: { userId: req.auth.userId, email: req.auth.email },
  });
  sendSuccess(res, { message: 'Razorpay configuration saved', data: config.toJSON() });
});

const get = asyncHandler(async (req, res) => {
  const config = await razorpayConfigService.getConfig();
  sendSuccess(res, { data: config.toJSON() });
});

module.exports = { save, get };
