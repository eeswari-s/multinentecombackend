const { Tenant } = require('../../models/tenant.model');
const tenantService = require('../tenantService');
const { recordAuditLog } = require('./auditLogService');
const ApiError = require('../../utils/ApiError');

async function getFlags(tenantId) {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw ApiError.notFound('Client not found');
  return tenant.featureFlags || {};
}

async function setFlags({ tenantId, flags, actor }) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw ApiError.notFound('Client not found');

  for (const [key, value] of Object.entries(flags)) {
    tenant.featureFlags.set(key, value);
  }
  await tenant.save();
  await tenantService.invalidateTenantCache(tenant);

  await recordAuditLog({
    action: 'feature_flag.updated',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    tenantId: tenant._id,
    metadata: { flags },
  });

  return Object.fromEntries(tenant.featureFlags);
}

module.exports = { getFlags, setFlags };
