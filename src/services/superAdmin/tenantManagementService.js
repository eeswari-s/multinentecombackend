const crypto = require('crypto');
const { Tenant } = require('../../models/tenant.model');
const { User } = require('../../models/user.model');
const { hashPassword } = require('../../utils/password');
const tenantService = require('../tenantService');
const tokenService = require('../tokenService');
const refreshTokenStore = require('../refreshTokenStore');
const { recordAuditLog } = require('./auditLogService');
const platformSettingsService = require('./platformSettingsService');
const platformNotificationService = require('./platformNotificationService');
const tenantOnboardingService = require('./tenantOnboardingService');
const ApiError = require('../../utils/ApiError');

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

async function createClient({
  businessName,
  contactEmail,
  contactPhone,
  gst,
  address,
  subdomain,
  ownerName,
  ownerEmail,
  ownerPassword,
  actor,
}) {
  const existing = await Tenant.findOne({ 'domain.subdomain': subdomain });
  if (existing) {
    throw ApiError.conflict('This subdomain is already taken');
  }

  const { defaultTrialDays } = await platformSettingsService.getSettings();
  const trialEndsAt = new Date(Date.now() + defaultTrialDays * 24 * 60 * 60 * 1000);

  const tenant = await Tenant.create({
    businessName,
    contactEmail,
    contactPhone,
    gst,
    address,
    domain: { subdomain },
    subscription: { trialEndsAt },
  });

  const temporaryPassword = ownerPassword || generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const owner = await User.create({
    role: 'owner',
    tenantId: tenant._id,
    name: ownerName,
    email: ownerEmail.toLowerCase(),
    passwordHash,
  });

  await recordAuditLog({
    action: 'tenant.created',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    tenantId: tenant._id,
    targetUserId: owner._id,
    metadata: { businessName, subdomain, ownerEmail: owner.email },
  });

  await platformNotificationService.notify({
    type: 'tenant_created',
    title: 'New tenant onboarded',
    message: `${businessName} (${subdomain}) has been onboarded.`,
    tenantId: tenant._id,
  });

  await tenantOnboardingService.provisionDefaults(tenant);

  // Only surfaced once, in this response — the caller (Super Admin) is
  // responsible for relaying it to the client since email delivery isn't
  // wired into this flow.
  return { tenant, owner, temporaryPassword: ownerPassword ? null : temporaryPassword };
}

async function listClients({ page = 1, limit = 20, status }) {
  const filter = status ? { status } : {};
  const [items, total] = await Promise.all([
    Tenant.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Tenant.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

async function getClient(tenantId) {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw ApiError.notFound('Client not found');
  return tenant;
}

async function updateClient({ tenantId, updates, actor }) {
  const tenant = await Tenant.findByIdAndUpdate(tenantId, { $set: updates }, { returnDocument: 'after', runValidators: true });
  if (!tenant) throw ApiError.notFound('Client not found');

  await tenantService.invalidateTenantCache(tenant);
  await recordAuditLog({
    action: 'tenant.updated',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    tenantId: tenant._id,
    metadata: { updates },
  });

  return tenant;
}

async function setClientStatus({ tenantId, status, actor }) {
  const tenant = await Tenant.findByIdAndUpdate(tenantId, { $set: { status } }, { returnDocument: 'after' });
  if (!tenant) throw ApiError.notFound('Client not found');

  await tenantService.invalidateTenantCache(tenant);
  await recordAuditLog({
    action: status === 'suspended' ? 'tenant.suspended' : status === 'deleted' ? 'tenant.deleted' : 'tenant.activated',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    tenantId: tenant._id,
    metadata: { status },
  });

  return tenant;
}

async function resetOwnerPassword({ tenantId, actor }) {
  const owner = await User.findOne({ tenantId, role: 'owner' });
  if (!owner) throw ApiError.notFound('No owner account found for this client');

  const temporaryPassword = generateTemporaryPassword();
  owner.passwordHash = await hashPassword(temporaryPassword);
  await owner.save();

  await refreshTokenStore.revokeAllDevices({ persona: 'admin', userId: String(owner._id) });

  await recordAuditLog({
    action: 'tenant.owner_password_reset',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    tenantId,
    targetUserId: owner._id,
  });

  return { ownerEmail: owner.email, temporaryPassword };
}

async function loginAsClient({ tenantId, actor }) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw ApiError.notFound('Client not found');
  if (tenant.status !== 'active') {
    throw ApiError.forbidden('Cannot impersonate a non-active client');
  }

  const owner = await User.findOne({ tenantId, role: 'owner', isActive: true });
  if (!owner) throw ApiError.notFound('No active owner account found for this client');

  const impersonationToken = tokenService.signImpersonationToken({
    userId: owner._id,
    tenantId: tenant._id,
    role: owner.role,
    deviceId: `impersonation-${crypto.randomUUID()}`,
    email: owner.email,
    impersonatedBy: { userId: actor.userId, email: actor.email },
  });

  await recordAuditLog({
    action: 'impersonation.started',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    tenantId,
    targetUserId: owner._id,
  });

  return { accessToken: impersonationToken, impersonatedUser: owner.toJSON() };
}

module.exports = {
  createClient,
  listClients,
  getClient,
  updateClient,
  setClientStatus,
  resetOwnerPassword,
  loginAsClient,
};
