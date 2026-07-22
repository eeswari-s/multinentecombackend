const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const brevoConfigService = require('../../services/clientAdmin/brevoConfigService');

const save = asyncHandler(async (req, res) => {
  const config = await brevoConfigService.saveConfig({
    ...req.body,
    actor: { userId: req.auth.userId, email: req.auth.email },
  });
  sendSuccess(res, { message: 'Brevo configuration saved', data: config.toJSON() });
});

const get = asyncHandler(async (req, res) => {
  const config = await brevoConfigService.getConfig();
  sendSuccess(res, { data: config.toJSON() });
});

module.exports = { save, get };
