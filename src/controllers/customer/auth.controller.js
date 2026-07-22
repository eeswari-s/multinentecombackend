const { randomUUID } = require('crypto');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const customerAuthService = require('../../services/customerAuthService');

const register = asyncHandler(async (req, res) => {
  const deviceId = req.body.deviceId || randomUUID();
  const { customer, accessToken, refreshToken } = await customerAuthService.register({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    phone: req.body.phone,
    deviceId,
    referralCode: req.body.referralCode,
  });

  sendSuccess(res, {
    statusCode: 201,
    message: 'Account created',
    data: { customer: customer.toJSON(), accessToken, refreshToken, deviceId },
  });
});

const login = asyncHandler(async (req, res) => {
  const deviceId = req.body.deviceId || randomUUID();
  const { customer, accessToken, refreshToken } = await customerAuthService.login({
    email: req.body.email,
    password: req.body.password,
    deviceId,
  });

  sendSuccess(res, {
    message: 'Login successful',
    data: { customer: customer.toJSON(), accessToken, refreshToken, deviceId },
  });
});

const refresh = asyncHandler(async (req, res) => {
  const tokens = await customerAuthService.refresh({
    refreshToken: req.body.refreshToken,
    deviceId: req.body.deviceId,
  });

  sendSuccess(res, { message: 'Token refreshed', data: tokens });
});

const logout = asyncHandler(async (req, res) => {
  await customerAuthService.logout({ userId: req.auth.userId, deviceId: req.body.deviceId });
  sendSuccess(res, { message: 'Logged out' });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const customer = await customerAuthService.verifyEmail({
    customerId: req.body.customerId,
    code: req.body.code,
  });
  sendSuccess(res, { message: 'Email verified', data: customer.toJSON() });
});

const resendOtp = asyncHandler(async (req, res) => {
  await customerAuthService.resendVerificationOtp({ customerId: req.body.customerId });
  sendSuccess(res, { message: 'Verification code resent' });
});

const forgotPassword = asyncHandler(async (req, res) => {
  await customerAuthService.forgotPassword({ email: req.body.email });
  sendSuccess(res, { message: 'If that account exists, a reset link has been sent' });
});

const resetPassword = asyncHandler(async (req, res) => {
  await customerAuthService.resetPassword({
    customerId: req.body.customerId,
    token: req.body.token,
    newPassword: req.body.newPassword,
  });
  sendSuccess(res, { message: 'Password reset successful' });
});

module.exports = { register, login, refresh, logout, verifyEmail, resendOtp, forgotPassword, resetPassword };
