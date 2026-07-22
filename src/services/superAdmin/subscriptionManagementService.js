const { Tenant } = require('../../models/tenant.model');
const { SubscriptionPlan } = require('../../models/subscriptionPlan.model');
const tenantService = require('../tenantService');
const { recordAuditLog } = require('./auditLogService');
const ApiError = require('../../utils/ApiError');

async function getTenantOrThrow(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw ApiError.notFound('Client not found');
  return tenant;
}

/**
 * Covers plan assignment as well as upgrade/downgrade (both are just
 * "point this tenant at a different plan"). Actual payment capture for
 * the new plan is handled separately by Razorpay Flow A (Phase 7); this
 * only updates the subscription's state.
 */
async function assignPlan({ tenantId, planId, billingCycle, actor }) {
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan || !plan.isActive) {
    throw ApiError.badRequest('Selected plan is not available');
  }
  if (!plan.pricing.has(billingCycle)) {
    throw ApiError.badRequest(`This plan has no pricing for the "${billingCycle}" billing cycle`);
  }

  const tenant = await getTenantOrThrow(tenantId);
  tenant.subscription.planId = plan._id;
  tenant.subscription.billingCycle = billingCycle;
  await tenant.save();

  await tenantService.invalidateTenantCache(tenant);
  await recordAuditLog({
    action: 'subscription.plan_assigned',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    tenantId: tenant._id,
    metadata: { planId: String(plan._id), billingCycle },
  });

  return tenant;
}

async function changeStatus({ tenantId, status, periodStart, periodEnd, actor }) {
  const tenant = await getTenantOrThrow(tenantId);

  tenant.subscription.status = status;
  if (periodStart) tenant.subscription.currentPeriodStart = periodStart;
  if (periodEnd) tenant.subscription.currentPeriodEnd = periodEnd;
  if (status === 'cancelled') tenant.subscription.cancelledAt = new Date();

  await tenant.save();
  await tenantService.invalidateTenantCache(tenant);

  await recordAuditLog({
    action: 'subscription.status_changed',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    tenantId: tenant._id,
    metadata: { status, periodStart, periodEnd },
  });

  return tenant;
}

async function extendTrial({ tenantId, trialEndsAt, actor }) {
  const tenant = await getTenantOrThrow(tenantId);

  tenant.subscription.status = 'trial';
  tenant.subscription.trialEndsAt = trialEndsAt;
  await tenant.save();
  await tenantService.invalidateTenantCache(tenant);

  await recordAuditLog({
    action: 'subscription.status_changed',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    tenantId: tenant._id,
    metadata: { status: 'trial', trialEndsAt },
  });

  return tenant;
}

module.exports = { assignPlan, changeStatus, extendTrial };
