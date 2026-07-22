const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const platformStaffService = require('../../services/superAdmin/platformStaffService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

const create = asyncHandler(async (req, res) => {
  const user = await platformStaffService.createPlatformStaff({ ...req.body, actor: actorFrom(req) });
  sendSuccess(res, { statusCode: 201, message: 'Platform staff account created', data: user.toJSON() });
});

const list = asyncHandler(async (req, res) => {
  const users = await platformStaffService.listPlatformStaff();
  sendSuccess(res, { data: users });
});

const deactivate = asyncHandler(async (req, res) => {
  const user = await platformStaffService.deactivatePlatformStaff({
    userId: req.params.userId,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Platform staff account deactivated', data: user.toJSON() });
});

module.exports = { create, list, deactivate };
