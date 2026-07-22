const { z } = require('zod');
const { BILLING_CYCLES, SUBSCRIPTION_STATUSES, TENANT_STATUSES } = require('../models/tenant.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const emailSchema = z.string().trim().toLowerCase().email();

const gstSchema = z
  .object({
    number: z.string().trim().optional(),
    registeredAddress: z.string().trim().optional(),
  })
  .optional();

const addressSchema = z
  .object({
    line1: z.string().trim().optional(),
    line2: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    country: z.string().trim().optional(),
    pincode: z.string().trim().optional(),
  })
  .optional();

const createClientSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  contactEmail: emailSchema,
  contactPhone: z.string().trim().optional(),
  gst: gstSchema,
  address: addressSchema,
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Subdomain may only contain lowercase letters, numbers and hyphens'),
  ownerName: z.string().trim().min(1).max(120),
  ownerEmail: emailSchema,
  ownerPassword: z.string().min(8).optional(),
});

const updateClientSchema = z.object({
  businessName: z.string().trim().min(1).max(200).optional(),
  contactEmail: emailSchema.optional(),
  contactPhone: z.string().trim().optional(),
  gst: gstSchema,
  address: addressSchema,
});

const setClientStatusSchema = z.object({
  status: z.enum(TENANT_STATUSES),
});

const listClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TENANT_STATUSES).optional(),
});

const clientIdParamsSchema = z.object({
  tenantId: objectId,
});

const assignPlanSchema = z.object({
  planId: objectId,
  billingCycle: z.enum(BILLING_CYCLES),
});

const changeSubscriptionStatusSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
});

const extendTrialSchema = z.object({
  trialEndsAt: z.coerce.date(),
});

const setFeatureFlagsSchema = z.object({
  flags: z.record(z.string(), z.boolean()),
});

const createPlatformStaffSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: z.string().min(8),
});

const userIdParamsSchema = z.object({
  userId: objectId,
});

module.exports = {
  createClientSchema,
  updateClientSchema,
  setClientStatusSchema,
  listClientsQuerySchema,
  clientIdParamsSchema,
  assignPlanSchema,
  changeSubscriptionStatusSchema,
  extendTrialSchema,
  setFeatureFlagsSchema,
  createPlatformStaffSchema,
  userIdParamsSchema,
};
