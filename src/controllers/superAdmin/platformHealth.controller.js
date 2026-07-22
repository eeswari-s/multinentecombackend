const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const platformHealthService = require('../../services/superAdmin/platformHealthService');

const getHealth = asyncHandler(async (req, res) => {
  const result = await platformHealthService.getPlatformHealth();
  sendSuccess(res, { data: result });
});

module.exports = { getHealth };
