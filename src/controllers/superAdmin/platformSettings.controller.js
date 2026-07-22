const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const platformSettingsService = require('../../services/superAdmin/platformSettingsService');

const get = asyncHandler(async (req, res) => {
  const settings = await platformSettingsService.getSettings();
  sendSuccess(res, { data: settings });
});

const update = asyncHandler(async (req, res) => {
  const settings = await platformSettingsService.updateSettings({
    updates: req.body,
    actor: { userId: req.auth.userId, email: req.auth.email },
  });
  sendSuccess(res, { message: 'Platform settings updated', data: settings });
});

module.exports = { get, update };
