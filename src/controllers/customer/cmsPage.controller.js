const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const cmsPageService = require('../../services/clientAdmin/cmsPageService');

const getBySlug = asyncHandler(async (req, res) => {
  const page = await cmsPageService.getPublishedPageBySlug(req.params.slug);
  sendSuccess(res, { data: page });
});

module.exports = { getBySlug };
