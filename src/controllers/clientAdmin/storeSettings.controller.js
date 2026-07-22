const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const storeSettingsService = require('../../services/clientAdmin/storeSettingsService');
const customDomainService = require('../../services/clientAdmin/customDomainService');

function actorFrom(req) {
  return { userId: req.auth.userId, email: req.auth.email };
}

const updateBranding = asyncHandler(async (req, res) => {
  const tenant = await storeSettingsService.updateBranding({
    brandColor: req.body.brandColor,
    logoFile: req.file,
    actor: { userId: req.auth.userId, email: req.auth.email },
  });
  sendSuccess(res, { message: 'Branding updated', data: tenant.branding });
});

const getBranding = asyncHandler(async (req, res) => {
  const branding = await storeSettingsService.getBranding();
  sendSuccess(res, { data: branding });
});

const updateShipping = asyncHandler(async (req, res) => {
  const shippingSettings = await storeSettingsService.updateShippingSettings({
    ...req.body,
    actor: { userId: req.auth.userId, email: req.auth.email },
  });
  sendSuccess(res, { message: 'Shipping settings updated', data: shippingSettings });
});

const getShipping = asyncHandler(async (req, res) => {
  const shippingSettings = await storeSettingsService.getShippingSettings();
  sendSuccess(res, { data: shippingSettings });
});

const getCustomDomain = asyncHandler(async (req, res) => {
  const status = await customDomainService.getDomainStatus();
  sendSuccess(res, { data: status });
});

const setCustomDomain = asyncHandler(async (req, res) => {
  const result = await customDomainService.setCustomDomain({ customDomain: req.body.customDomain, actor: actorFrom(req) });
  sendSuccess(res, {
    statusCode: 201,
    message: 'Custom domain set. Add the TXT record below, then verify.',
    data: result,
  });
});

const verifyCustomDomain = asyncHandler(async (req, res) => {
  const result = await customDomainService.verifyCustomDomain({ actor: actorFrom(req) });
  sendSuccess(res, { message: 'Custom domain verified', data: result });
});

const removeCustomDomain = asyncHandler(async (req, res) => {
  await customDomainService.removeCustomDomain({ actor: actorFrom(req) });
  sendSuccess(res, { message: 'Custom domain removed' });
});

module.exports = {
  updateBranding,
  getBranding,
  updateShipping,
  getShipping,
  getCustomDomain,
  setCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
};
