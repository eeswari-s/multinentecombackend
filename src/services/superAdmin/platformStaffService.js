const { User } = require('../../models/user.model');
const { hashPassword } = require('../../utils/password');
const refreshTokenStore = require('../refreshTokenStore');
const { recordAuditLog } = require('./auditLogService');
const ApiError = require('../../utils/ApiError');

async function createPlatformStaff({ name, email, password, actor }) {
  const existing = await User.findOne({ role: 'super_admin', email: email.toLowerCase() });
  if (existing) throw ApiError.conflict('A platform staff account with this email already exists');

  const passwordHash = await hashPassword(password);
  const user = await User.create({ role: 'super_admin', name, email: email.toLowerCase(), passwordHash });

  await recordAuditLog({
    action: 'platform_staff.created',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    targetUserId: user._id,
    metadata: { email: user.email },
  });

  return user;
}

async function listPlatformStaff() {
  return User.find({ role: 'super_admin' }).sort({ createdAt: -1 }).lean();
}

async function deactivatePlatformStaff({ userId, actor }) {
  const user = await User.findOneAndUpdate(
    { _id: userId, role: 'super_admin' },
    { $set: { isActive: false } },
    { returnDocument: 'after' }
  );
  if (!user) throw ApiError.notFound('Platform staff account not found');

  await refreshTokenStore.revokeAllDevices({ persona: 'admin', userId: String(user._id) });

  await recordAuditLog({
    action: 'platform_staff.deactivated',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    targetUserId: user._id,
  });

  return user;
}

module.exports = { createPlatformStaff, listPlatformStaff, deactivatePlatformStaff };
