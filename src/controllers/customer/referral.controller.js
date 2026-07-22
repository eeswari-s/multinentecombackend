const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const loyaltyService = require('../../services/customer/loyaltyService');

const getSummary = asyncHandler(async (req, res) => {
  const summary = await loyaltyService.getLoyaltySummary(req.auth.userId);
  sendSuccess(res, { data: summary });
});

module.exports = { getSummary };
