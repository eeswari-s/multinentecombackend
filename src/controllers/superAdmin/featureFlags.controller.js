const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const featureFlagService = require('../../services/superAdmin/featureFlagService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

const getFlags = asyncHandler(async (req, res) => {
  const flags = await featureFlagService.getFlags(req.params.tenantId);
  sendSuccess(res, { data: flags });
});

const setFlags = asyncHandler(async (req, res) => {
  const flags = await featureFlagService.setFlags({
    tenantId: req.params.tenantId,
    flags: req.body.flags,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Feature flags updated', data: flags });
});

module.exports = { getFlags, setFlags };
