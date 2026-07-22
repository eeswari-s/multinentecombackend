const { z } = require('zod');
const { BILLING_CYCLES } = require('../models/tenant.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const limitsSchema = z
  .object({
    maxProducts: z.coerce.number().int().min(0).nullable().optional(),
    maxStaffUsers: z.coerce.number().int().min(0).nullable().optional(),
    maxOrdersPerMonth: z.coerce.number().int().min(0).nullable().optional(),
    maxStorageMB: z.coerce.number().int().min(0).nullable().optional(),
  })
  .optional();

// z.record() with an enum key schema validates every possible enum key as
// required (a Zod behavior, not a bug in the data) — an object with each
// cycle as an explicitly optional key is what actually allows a partial
// pricing map (e.g. monthly-only) through.
const pricingSchema = z
  .object(Object.fromEntries(BILLING_CYCLES.map((cycle) => [cycle, z.coerce.number().min(0).optional()])))
  .refine((pricing) => Object.keys(pricing).length > 0, 'At least one billing cycle price is required');

const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  pricing: pricingSchema,
  limits: limitsSchema,
  features: z.array(z.string().trim()).optional(),
});

const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1000).optional(),
  pricing: pricingSchema.optional(),
  limits: limitsSchema,
  features: z.array(z.string().trim()).optional(),
  isActive: z.boolean().optional(),
});

const listPlansQuerySchema = z.object({ isActive: z.coerce.boolean().optional() });
const planIdParamsSchema = z.object({ id: objectId });

module.exports = { createPlanSchema, updatePlanSchema, listPlansQuerySchema, planIdParamsSchema };
