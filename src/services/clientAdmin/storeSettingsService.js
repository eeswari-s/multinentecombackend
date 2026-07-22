const { Tenant } = require('../../models/tenant.model');
const uploadService = require('../../integrations/cloudinary/uploadService');
const tenantService = require('../tenantService');
const requestContext = require('../../utils/requestContext');
const { recordActivityLog } = require('./activityLogService');

async function updateBranding({ brandColor, logoFile, actor }) {
  const tenantId = requestContext.getTenantId();
  const tenant = await Tenant.findById(tenantId);

  if (brandColor) tenant.branding.brandColor = brandColor;

  if (logoFile) {
    const previousLogo = { publicId: tenant.branding.logoPublicId, bytes: tenant.branding.logoBytes };
    // uploadBuffer adjusts tenant.storageUsedBytes via its own atomic
    // updateOne — this document must NOT be saved as a whole afterward
    // (that would overwrite the increment with this stale in-memory copy),
    // so the branding fields are persisted via a targeted $set instead.
    const uploaded = await uploadService.uploadBuffer(logoFile.buffer, `tenants/${tenantId}/branding`);
    tenant.branding.logoUrl = uploaded.url;
    tenant.branding.logoPublicId = uploaded.publicId;
    tenant.branding.logoBytes = uploaded.bytes;
    if (previousLogo.publicId) await uploadService.deleteImage(previousLogo.publicId, 'image', previousLogo.bytes);

    await Tenant.updateOne(
      { _id: tenantId },
      {
        $set: {
          'branding.brandColor': tenant.branding.brandColor,
          'branding.logoUrl': tenant.branding.logoUrl,
          'branding.logoPublicId': tenant.branding.logoPublicId,
          'branding.logoBytes': tenant.branding.logoBytes,
        },
      }
    );
  } else {
    await tenant.save();
  }

  await tenantService.invalidateTenantCache(tenant);

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'store_settings.branding_updated',
    targetType: 'Tenant',
    targetId: tenant._id,
  });

  return tenant;
}

async function getBranding() {
  const tenant = await Tenant.findById(requestContext.getTenantId()).lean();
  return tenant.branding;
}

async function updateShippingSettings({ flatRate, freeShippingThreshold, actor }) {
  const tenant = await Tenant.findById(requestContext.getTenantId());

  if (flatRate !== undefined) tenant.shippingSettings.flatRate = flatRate;
  if (freeShippingThreshold !== undefined) tenant.shippingSettings.freeShippingThreshold = freeShippingThreshold;

  await tenant.save();
  await tenantService.invalidateTenantCache(tenant);

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'store_settings.shipping_updated',
    targetType: 'Tenant',
    targetId: tenant._id,
  });

  return tenant.shippingSettings;
}

async function getShippingSettings() {
  const tenant = await Tenant.findById(requestContext.getTenantId()).lean();
  return tenant.shippingSettings;
}

module.exports = { updateBranding, getBranding, updateShippingSettings, getShippingSettings };
