const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const bannerService = require('../../services/clientAdmin/bannerService');

const list = asyncHandler(async (req, res) => {
  const banners = await bannerService.listActiveBanners(req.query);
  sendSuccess(res, { data: banners });
});

module.exports = { list };
