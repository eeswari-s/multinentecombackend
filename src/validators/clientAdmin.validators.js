const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const emailSchema = z.string().trim().toLowerCase().email();

const inviteStaffSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  role: z.enum(['manager', 'support_staff']),
  password: z.string().min(8),
});

const updateStaffRoleSchema = z.object({
  role: z.enum(['manager', 'support_staff']),
});

const staffIdParamsSchema = z.object({
  userId: objectId,
});

module.exports = { inviteStaffSchema, updateStaffRoleSchema, staffIdParamsSchema };
