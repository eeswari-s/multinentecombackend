const { z } = require('zod');
const { BILLING_CYCLES } = require('../models/tenant.model');
const { SUBSCRIPTION_INVOICE_STATUSES } = require('../models/subscriptionInvoice.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const initiatePaymentSchema = z.object({
  billingCycle: z.enum(BILLING_CYCLES),
});

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().trim().min(1),
  razorpayPaymentId: z.string().trim().min(1),
  razorpaySignature: z.string().trim().min(1),
});

const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SUBSCRIPTION_INVOICE_STATUSES).optional(),
  tenantId: objectId.optional(),
});

const reconciliationQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

module.exports = { initiatePaymentSchema, verifyPaymentSchema, listInvoicesQuerySchema, reconciliationQuerySchema };
