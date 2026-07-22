const { User } = require('../models/user.model');
const { Tenant } = require('../models/tenant.model');
const { hashPassword, comparePassword } = require('../utils/password');
const tokenService = require('./tokenService');
const refreshTokenStore = require('./refreshTokenStore');
const verificationCodeService = require('./verificationCodeService');
const { enqueueEmail } = require('../jobs/queues/email.queue');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const PERSONA = 'admin';
const RESET_PASSWORD_PURPOSE = 'reset_password';

async function issueTokenPair(user, deviceId) {
  const payload = {
    userId: user._id,
    tenantId: user.tenantId || null,
    role: user.role,
    persona: PERSONA,
    deviceId,
    email: user.email,
  };
  const accessToken = tokenService.signAccessToken(payload);
  const refreshToken = tokenService.signRefreshToken(payload);
  await refreshTokenStore.storeRefreshToken({
    persona: PERSONA,
    userId: String(user._id),
    deviceId,
    token: refreshToken,
  });
  return { accessToken, refreshToken };
}

async function loginSuperAdmin({ email, password, deviceId }) {
  const user = await User.findOne({ role: 'super_admin', email: email.toLowerCase() });
  if (!user || !user.isActive || !(await comparePassword(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokenPair(user, deviceId);
  return { user, ...tokens };
}

/**
 * `tenantId` must already be resolved (e.g. via resolveTenantFromDomain on
 * the Client Admin login route) — the same email may legitimately belong
 * to different staff accounts across different tenants.
 */
async function loginClientAdmin({ tenantId, email, password, deviceId }) {
  const user = await User.findOne({
    tenantId,
    email: email.toLowerCase(),
    role: { $in: ['owner', 'manager', 'support_staff'] },
  });
  if (!user || !user.isActive || !(await comparePassword(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokenPair(user, deviceId);
  return { user, ...tokens };
}

async function refresh({ refreshToken, deviceId }) {
  let claims;
  try {
    claims = tokenService.verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  if (claims.persona !== PERSONA || claims.deviceId !== deviceId) {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  const isValid = await refreshTokenStore.verifyRefreshToken({
    persona: PERSONA,
    userId: claims.sub,
    deviceId,
    token: refreshToken,
  });
  if (!isValid) {
    throw ApiError.unauthorized('Refresh token has been revoked, please log in again');
  }

  const user = await User.findById(claims.sub);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Account is no longer active');
  }

  // Rotate on every use: the old refresh token can never be replayed again.
  await refreshTokenStore.revokeDevice({ persona: PERSONA, userId: claims.sub, deviceId });
  return issueTokenPair(user, deviceId);
}

async function logout({ userId, deviceId }) {
  await refreshTokenStore.revokeDevice({ persona: PERSONA, userId, deviceId });
}

async function logoutAllDevices({ userId }) {
  await refreshTokenStore.revokeAllDevices({ persona: PERSONA, userId });
}

/**
 * `tenantId` is null for a super_admin's own password reset (platform
 * login has no tenant) and required for a Client Admin staff member's
 * (resolved the same way login resolves it — via domain).
 */
async function forgotPassword({ tenantId, email }) {
  const filter = tenantId
    ? { tenantId, email: email.toLowerCase(), role: { $in: ['owner', 'manager', 'support_staff'] } }
    : { tenantId: undefined, email: email.toLowerCase(), role: 'super_admin' };

  const user = await User.findOne(filter);
  // Deliberately silent on a non-existent account.
  if (!user) return;

  const token = await verificationCodeService.issueToken({
    persona: PERSONA,
    purpose: RESET_PASSWORD_PURPOSE,
    subjectId: String(user._id),
  });

  let resetUrl;
  if (tenantId) {
    const tenant = await Tenant.findById(tenantId).lean();
    resetUrl = `https://${tenant.domain.subdomain}.${env.baseDomain}/admin/reset-password?userId=${user._id}&token=${token}`;
  } else {
    resetUrl = `https://${env.baseDomain}/admin/reset-password?userId=${user._id}&token=${token}`;
  }

  await enqueueEmail({
    tenantId: tenantId || null,
    type: 'password_reset',
    to: user.email,
    data: { resetUrl },
  });
}

async function resetPassword({ userId, token, newPassword }) {
  const isValid = await verificationCodeService.verifyAndConsume({
    persona: PERSONA,
    purpose: RESET_PASSWORD_PURPOSE,
    subjectId: String(userId),
    value: token,
  });
  if (!isValid) throw ApiError.badRequest('Invalid or expired reset token');

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('Account not found');

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  await refreshTokenStore.revokeAllDevices({ persona: PERSONA, userId: String(user._id) });
}

module.exports = {
  loginSuperAdmin,
  loginClientAdmin,
  refresh,
  logout,
  logoutAllDevices,
  forgotPassword,
  resetPassword,
};
