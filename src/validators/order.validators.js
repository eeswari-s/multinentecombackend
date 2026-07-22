const { z } = require('zod');
const { ORDER_STATUSES } = require('../models/order.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const orderIdParamsSchema = z.object({ id: objectId });
const cancelOrderSchema = z.object({ reason: z.string().trim().max(500).optional() });
const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ORDER_STATUSES).optional(),
});
const updateOrderStatusSchema = z.object({ status: z.enum(ORDER_STATUSES) });
const refundOrderSchema = z.object({
  amount: z.coerce.number().min(0.01).optional(),
  reason: z.string().trim().max(500).optional(),
});

module.exports = {
  orderIdParamsSchema,
  cancelOrderSchema,
  listOrdersQuerySchema,
  updateOrderStatusSchema,
  refundOrderSchema,
};
