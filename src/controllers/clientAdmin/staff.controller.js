const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const requestContext = require('../../utils/requestContext');
const staffService = require('../../services/clientAdmin/staffService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

const invite = asyncHandler(async (req, res) => {
  const user = await staffService.inviteStaff({
    tenantId: requestContext.getTenantId(),
    ...req.body,
    actor: actorFrom(req),
  });
  sendSuccess(res, { statusCode: 201, message: 'Staff account created', data: user.toJSON() });
});

const list = asyncHandler(async (req, res) => {
  const users = await staffService.listStaff(requestContext.getTenantId());
  sendSuccess(res, { data: users });
});

const updateRole = asyncHandler(async (req, res) => {
  const user = await staffService.updateStaffRole({
    tenantId: requestContext.getTenantId(),
    userId: req.params.userId,
    role: req.body.role,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Staff role updated', data: user.toJSON() });
});

const deactivate = asyncHandler(async (req, res) => {
  const user = await staffService.deactivateStaff({
    tenantId: requestContext.getTenantId(),
    userId: req.params.userId,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Staff account deactivated', data: user.toJSON() });
});

module.exports = { invite, list, updateRole, deactivate };
