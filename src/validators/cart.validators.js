const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const addItemSchema = z.object({
  productId: objectId,
  sku: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
});

const itemIdParamsSchema = z.object({ itemId: objectId });

const updateItemBodySchema = z.object({
  quantity: z.coerce.number().int().min(0),
});

const shippingAddressSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(6),
  line1: z.string().trim().min(1),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  country: z.string().trim().optional(),
  pincode: z.string().trim().min(3),
});

const checkoutSchema = z.object({
  paymentMethod: z.enum(['razorpay', 'cod']),
});

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().trim().min(1),
  razorpayPaymentId: z.string().trim().min(1),
  razorpaySignature: z.string().trim().min(1),
});

const savedItemIdParamsSchema = z.object({ savedItemId: objectId });
const moveToCartBodySchema = z.object({ quantity: z.coerce.number().int().min(1).default(1) });
const orderIdParamsSchema = z.object({ orderId: objectId });

module.exports = {
  addItemSchema,
  itemIdParamsSchema,
  updateItemBodySchema,
  shippingAddressSchema,
  checkoutSchema,
  verifyPaymentSchema,
  savedItemIdParamsSchema,
  moveToCartBodySchema,
  orderIdParamsSchema,
};
