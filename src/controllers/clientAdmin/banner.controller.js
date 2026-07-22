const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const bannerService = require('../../services/clientAdmin/bannerService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

const create = asyncHandler(async (req, res) => {
  const banner = await bannerService.createBanner({ ...req.body, imageFile: req.file, actor: actorFrom(req) });
  sendSuccess(res, { statusCode: 201, message: 'Banner created', data: banner });
});

const list = asyncHandler(async (req, res) => {
  const banners = await bannerService.listBanners(req.query);
  sendSuccess(res, { data: banners });
});

const update = asyncHandler(async (req, res) => {
  const banner = await bannerService.updateBanner({
    id: req.params.id,
    updates: req.body,
    imageFile: req.file,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Banner updated', data: banner });
});

const remove = asyncHandler(async (req, res) => {
  await bannerService.deleteBanner({ id: req.params.id, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Banner deleted' });
});

module.exports = { create, list, update, remove };
