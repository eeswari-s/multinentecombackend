const { Banner } = require('../../models/banner.model');
const uploadService = require('../../integrations/cloudinary/uploadService');
const requestContext = require('../../utils/requestContext');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

async function createBanner({ title, linkUrl, position, sortOrder, startAt, endAt, imageFile, actor }) {
  if (!imageFile) throw ApiError.badRequest('A banner image is required');

  const uploaded = await uploadService.uploadBuffer(imageFile.buffer, `tenants/${requestContext.getTenantId()}/banners`);

  const banner = await Banner.create({
    title,
    linkUrl,
    position,
    sortOrder,
    startAt,
    endAt,
    image: uploaded,
  });

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'banner.created',
    targetType: 'Banner',
    targetId: banner._id,
  });

  return banner;
}

async function listBanners({ position, isActive }) {
  const filter = {};
  if (position) filter.position = position;
  if (isActive !== undefined) filter.isActive = isActive;
  return Banner.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
}

async function updateBanner({ id, updates, imageFile, actor }) {
  const banner = await Banner.findById(id);
  if (!banner) throw ApiError.notFound('Banner not found');

  if (imageFile) {
    const previousImage = banner.image;
    banner.image = await uploadService.uploadBuffer(imageFile.buffer, `tenants/${requestContext.getTenantId()}/banners`);
    await uploadService.deleteImage(previousImage.publicId, 'image', previousImage.bytes);
  }

  Object.assign(banner, updates);
  await banner.save();

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'banner.updated',
    targetType: 'Banner',
    targetId: banner._id,
  });

  return banner;
}

async function deleteBanner({ id, actor }) {
  const banner = await Banner.findByIdAndDelete(id);
  if (!banner) throw ApiError.notFound('Banner not found');

  await uploadService.deleteImage(banner.image.publicId, 'image', banner.image.bytes);

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'banner.deleted',
    targetType: 'Banner',
    targetId: banner._id,
  });
}

/** Customer-facing: only currently-active, date-window-valid banners. */
async function listActiveBanners({ position }) {
  const now = new Date();
  const filter = {
    isActive: true,
    $and: [
      { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
    ],
  };
  if (position) filter.position = position;
  return Banner.find(filter).sort({ sortOrder: 1 }).lean();
}

module.exports = { createBanner, listBanners, updateBanner, deleteBanner, listActiveBanners };
