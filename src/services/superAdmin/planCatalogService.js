const { SubscriptionPlan } = require('../../models/subscriptionPlan.model');
const { recordAuditLog } = require('./auditLogService');
const ApiError = require('../../utils/ApiError');

async function createPlan({ name, description, pricing, limits, features, actor }) {
  const plan = await SubscriptionPlan.create({ name, description, pricing, limits, features });

  await recordAuditLog({
    action: 'platform_settings.updated',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    metadata: { entity: 'subscription_plan', op: 'created', planId: plan._id, name },
  });

  return plan;
}

async function listPlans({ isActive }) {
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  return SubscriptionPlan.find(filter).sort({ createdAt: -1 }).lean();
}

async function getPlanById(id) {
  const plan = await SubscriptionPlan.findById(id).lean();
  if (!plan) throw ApiError.notFound('Plan not found');
  return plan;
}

async function updatePlan({ id, updates, actor }) {
  const plan = await SubscriptionPlan.findById(id);
  if (!plan) throw ApiError.notFound('Plan not found');

  Object.assign(plan, updates);
  await plan.save();

  await recordAuditLog({
    action: 'platform_settings.updated',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    metadata: { entity: 'subscription_plan', op: 'updated', planId: plan._id, updates: Object.keys(updates) },
  });

  return plan;
}

module.exports = { createPlan, listPlans, getPlanById, updatePlan };
