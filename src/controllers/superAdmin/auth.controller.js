const { randomUUID } = require('crypto');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const adminAuthService = require('../../services/adminAuthService');

const login = asyncHandler(async (req, res) => {
  const deviceId = req.body.deviceId || randomUUID();
  const { user, accessToken, refreshToken } = await adminAuthService.loginSuperAdmin({
    email: req.body.email,
    password: req.body.password,
    deviceId,
  });

  sendSuccess(res, {
    message: 'Login successful',
    data: { user: user.toJSON(), accessToken, refreshToken, deviceId },
  });
});

const refresh = asyncHandler(async (req, res) => {
  const tokens = await adminAuthService.refresh({
    refreshToken: req.body.refreshToken,
    deviceId: req.body.deviceId,
  });

  sendSuccess(res, { message: 'Token refreshed', data: tokens });
});

const logout = asyncHandler(async (req, res) => {
  await adminAuthService.logout({ userId: req.auth.userId, deviceId: req.body.deviceId });
  sendSuccess(res, { message: 'Logged out' });
});

const forgotPassword = asyncHandler(async (req, res) => {
  await adminAuthService.forgotPassword({ tenantId: null, email: req.body.email });
  sendSuccess(res, { message: 'If that account exists, a reset link has been sent' });
});

const resetPassword = asyncHandler(async (req, res) => {
  await adminAuthService.resetPassword({
    userId: req.body.userId,
    token: req.body.token,
    newPassword: req.body.newPassword,
  });
  sendSuccess(res, { message: 'Password reset successful' });
});

module.exports = { login, refresh, logout, forgotPassword, resetPassword };
