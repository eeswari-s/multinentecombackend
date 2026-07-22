const { User } = require('../../models/user.model');
const { hashPassword } = require('../../utils/password');
const refreshTokenStore = require('../refreshTokenStore');
const { recordActivityLog } = require('./activityLogService');
const quotaService = require('./quotaService');
const ApiError = require('../../utils/ApiError');

const INVITABLE_ROLES = ['manager', 'support_staff'];

async function inviteStaff({ tenantId, name, email, role, password, actor }) {
  if (!INVITABLE_ROLES.includes(role)) {
    throw ApiError.badRequest(`role must be one of: ${INVITABLE_ROLES.join(', ')}`);
  }
  await quotaService.assertStaffQuota();

  const existing = await User.findOne({ tenantId, email: email.toLowerCase() });
  if (existing) throw ApiError.conflict('A staff account with this email already exists for this store');

  const passwordHash = await hashPassword(password);
  const user = await User.create({ role, tenantId, name, email: email.toLowerCase(), passwordHash });

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'staff.invited',
    targetType: 'User',
    targetId: user._id,
    metadata: { email: user.email, role },
  });

  return user;
}

async function listStaff(tenantId) {
  return User.find({ tenantId, role: { $in: ['owner', ...INVITABLE_ROLES] } })
    .sort({ createdAt: -1 })
    .lean();
}

async function updateStaffRole({ tenantId, userId, role, actor }) {
  if (!INVITABLE_ROLES.includes(role)) {
    throw ApiError.badRequest(`role must be one of: ${INVITABLE_ROLES.join(', ')}`);
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, tenantId, role: { $in: INVITABLE_ROLES } },
    { $set: { role } },
    { returnDocument: 'after' }
  );
  if (!user) throw ApiError.notFound('Staff account not found');

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'staff.role_updated',
    targetType: 'User',
    targetId: user._id,
    metadata: { role },
  });

  return user;
}

async function deactivateStaff({ tenantId, userId, actor }) {
  const user = await User.findOneAndUpdate(
    { _id: userId, tenantId, role: { $in: INVITABLE_ROLES } },
    { $set: { isActive: false } },
    { returnDocument: 'after' }
  );
  if (!user) throw ApiError.notFound('Staff account not found');

  await refreshTokenStore.revokeAllDevices({ persona: 'admin', userId: String(user._id) });

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'staff.deactivated',
    targetType: 'User',
    targetId: user._id,
  });

  return user;
}

module.exports = { inviteStaff, listStaff, updateStaffRole, deactivateStaff };
