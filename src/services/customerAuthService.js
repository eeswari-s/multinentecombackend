const { Customer } = require('../models/customer.model');
const loyaltyService = require('./customer/loyaltyService');
const { hashPassword, comparePassword } = require('../utils/password');
const tokenService = require('./tokenService');
const refreshTokenStore = require('./refreshTokenStore');
const verificationCodeService = require('./verificationCodeService');
const { enqueueEmail } = require('../jobs/queues/email.queue');
const requestContext = require('../utils/requestContext');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const PERSONA = 'customer';
const ROLE = 'customer';
const VERIFY_EMAIL_PURPOSE = 'verify_email';
const RESET_PASSWORD_PURPOSE = 'reset_password';

async function issueTokenPair(customer, deviceId) {
  const payload = {
    userId: customer._id,
    tenantId: customer.tenantId,
    role: ROLE,
    persona: PERSONA,
    deviceId,
    email: customer.email,
  };
  const accessToken = tokenService.signAccessToken(payload);
  const refreshToken = tokenService.signRefreshToken(payload);
  await refreshTokenStore.storeRefreshToken({
    persona: PERSONA,
    userId: String(customer._id),
    deviceId,
    token: refreshToken,
  });
  return { accessToken, refreshToken };
}

async function sendVerificationOtp(customer) {
  const code = await verificationCodeService.issueNumericCode({
    persona: PERSONA,
    purpose: VERIFY_EMAIL_PURPOSE,
    subjectId: String(customer._id),
  });
  await enqueueEmail({
    tenantId: customer.tenantId,
    type: 'otp',
    to: customer.email,
    data: { code, purpose: 'email verification' },
  });
}

async function register({ name, email, password, phone, deviceId, referralCode }) {
  const existing = await Customer.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const customer = await Customer.create({ name, email: email.toLowerCase(), phone, passwordHash });
  await loyaltyService.initializeLoyalty({ customer, referralCode });

  await sendVerificationOtp(customer);

  const tokens = await issueTokenPair(customer, deviceId);
  return { customer, ...tokens };
}

async function resendVerificationOtp({ customerId }) {
  const customer = await Customer.findById(customerId);
  if (!customer) throw ApiError.notFound('Account not found');
  if (customer.isVerified) throw ApiError.conflict('This account is already verified');
  await sendVerificationOtp(customer);
}

async function verifyEmail({ customerId, code }) {
  const isValid = await verificationCodeService.verifyAndConsume({
    persona: PERSONA,
    purpose: VERIFY_EMAIL_PURPOSE,
    subjectId: String(customerId),
    value: code,
  });
  if (!isValid) throw ApiError.badRequest('Invalid or expired verification code');

  const customer = await Customer.findByIdAndUpdate(customerId, { $set: { isVerified: true } }, { returnDocument: 'after' });
  if (!customer) throw ApiError.notFound('Account not found');
  return customer;
}

async function forgotPassword({ email }) {
  const customer = await Customer.findOne({ email: email.toLowerCase() });
  // Deliberately silent on a non-existent account — do not leak whether an
  // email is registered.
  if (!customer) return;

  const token = await verificationCodeService.issueToken({
    persona: PERSONA,
    purpose: RESET_PASSWORD_PURPOSE,
    subjectId: String(customer._id),
  });

  const tenant = requestContext.getTenant();
  const resetUrl = `https://${tenant.domain.subdomain}.${env.baseDomain}/reset-password?customerId=${customer._id}&token=${token}`;

  await enqueueEmail({
    tenantId: customer.tenantId,
    type: 'password_reset',
    to: customer.email,
    data: { resetUrl },
  });
}

async function resetPassword({ customerId, token, newPassword }) {
  const isValid = await verificationCodeService.verifyAndConsume({
    persona: PERSONA,
    purpose: RESET_PASSWORD_PURPOSE,
    subjectId: String(customerId),
    value: token,
  });
  if (!isValid) throw ApiError.badRequest('Invalid or expired reset token');

  const customer = await Customer.findById(customerId);
  if (!customer) throw ApiError.notFound('Account not found');

  customer.passwordHash = await hashPassword(newPassword);
  await customer.save();

  await refreshTokenStore.revokeAllDevices({ persona: PERSONA, userId: String(customer._id) });
}

async function login({ email, password, deviceId }) {
  const customer = await Customer.findOne({ email: email.toLowerCase() });
  if (!customer || customer.status !== 'active' || !(await comparePassword(password, customer.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  customer.lastLoginAt = new Date();
  await customer.save();

  const tokens = await issueTokenPair(customer, deviceId);
  return { customer, ...tokens };
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

  const activeTenantId = requestContext.getTenantId();
  if (!activeTenantId || claims.tenantId !== activeTenantId) {
    throw ApiError.unauthorized('Refresh token does not belong to this store');
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

  const customer = await Customer.findById(claims.sub);
  if (!customer || customer.status !== 'active') {
    throw ApiError.unauthorized('Account is no longer active');
  }

  await refreshTokenStore.revokeDevice({ persona: PERSONA, userId: claims.sub, deviceId });
  return issueTokenPair(customer, deviceId);
}

async function logout({ userId, deviceId }) {
  await refreshTokenStore.revokeDevice({ persona: PERSONA, userId, deviceId });
}

async function logoutAllDevices({ userId }) {
  await refreshTokenStore.revokeAllDevices({ persona: PERSONA, userId });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAllDevices,
  resendVerificationOtp,
  verifyEmail,
  forgotPassword,
  resetPassword,
};
