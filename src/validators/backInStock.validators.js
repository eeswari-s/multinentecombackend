const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const subscribeSchema = z.object({
  productId: objectId,
  sku: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
});

const unsubscribeQuerySchema = z.object({
  productId: objectId,
  sku: z.string().trim().min(1),
});

module.exports = { subscribeSchema, unsubscribeQuerySchema };
