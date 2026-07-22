const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const analyticsQueryService = require('../../services/clientAdmin/analyticsQueryService');

const getSummary = asyncHandler(async (req, res) => {
  const summary = await analyticsQueryService.getAnalyticsSummary(req.query);
  sendSuccess(res, { data: summary });
});

module.exports = { getSummary };
