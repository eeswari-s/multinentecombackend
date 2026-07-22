const { z } = require('zod');

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');
const deviceIdSchema = z.string().trim().min(1).max(128).optional();

const superAdminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  deviceId: deviceIdSchema,
});

const clientAdminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  deviceId: deviceIdSchema,
});

const customerRegisterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().min(6).max(20).optional(),
  deviceId: deviceIdSchema,
  referralCode: z.string().trim().toUpperCase().max(20).optional(),
});

const customerLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  deviceId: deviceIdSchema,
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().trim().min(1).max(128),
});

const logoutSchema = z.object({
  deviceId: z.string().trim().min(1).max(128),
});

const verifyEmailSchema = z.object({
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  code: z.string().trim().length(6),
});

const resendOtpSchema = z.object({
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/),
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const customerResetPasswordSchema = z.object({
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  token: z.string().trim().min(1),
  newPassword: passwordSchema,
});

const adminResetPasswordSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  token: z.string().trim().min(1),
  newPassword: passwordSchema,
});

module.exports = {
  superAdminLoginSchema,
  clientAdminLoginSchema,
  customerRegisterSchema,
  customerLoginSchema,
  refreshTokenSchema,
  logoutSchema,
  verifyEmailSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  customerResetPasswordSchema,
  adminResetPasswordSchema,
};
