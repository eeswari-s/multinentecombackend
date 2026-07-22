const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const subscriptionManagementService = require('../../services/superAdmin/subscriptionManagementService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

const assignPlan = asyncHandler(async (req, res) => {
  const tenant = await subscriptionManagementService.assignPlan({
    tenantId: req.params.tenantId,
    planId: req.body.planId,
    billingCycle: req.body.billingCycle,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Plan assigned', data: tenant });
});

const changeStatus = asyncHandler(async (req, res) => {
  const tenant = await subscriptionManagementService.changeStatus({
    tenantId: req.params.tenantId,
    status: req.body.status,
    periodStart: req.body.periodStart,
    periodEnd: req.body.periodEnd,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Subscription status updated', data: tenant });
});

const extendTrial = asyncHandler(async (req, res) => {
  const tenant = await subscriptionManagementService.extendTrial({
    tenantId: req.params.tenantId,
    trialEndsAt: req.body.trialEndsAt,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Trial extended', data: tenant });
});

module.exports = { assignPlan, changeStatus, extendTrial };
