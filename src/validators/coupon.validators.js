const { z } = require('zod');
const { DISCOUNT_TYPES } = require('../models/coupon.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createCouponSchema = z.object({
  code: z.string().trim().min(3).max(30),
  description: z.string().trim().max(300).optional(),
  discountType: z.enum(DISCOUNT_TYPES),
  discountValue: z.coerce.number().min(0),
  maxDiscountAmount: z.coerce.number().min(0).optional(),
  minOrderValue: z.coerce.number().min(0).optional(),
  usageLimit: z.coerce.number().int().min(1).optional(),
  perCustomerLimit: z.coerce.number().int().min(1).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  isPublic: z.boolean().optional(),
});

const updateCouponSchema = z.object({
  description: z.string().trim().max(300).optional(),
  discountType: z.enum(DISCOUNT_TYPES).optional(),
  discountValue: z.coerce.number().min(0).optional(),
  maxDiscountAmount: z.coerce.number().min(0).optional(),
  minOrderValue: z.coerce.number().min(0).optional(),
  usageLimit: z.coerce.number().int().min(1).optional(),
  perCustomerLimit: z.coerce.number().int().min(1).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

const listCouponsQuerySchema = z.object({
  isActive: z.coerce.boolean().optional(),
});

const couponIdParamsSchema = z.object({ id: objectId });

const applyCouponSchema = z.object({
  code: z.string().trim().min(1),
});

module.exports = {
  createCouponSchema,
  updateCouponSchema,
  listCouponsQuerySchema,
  couponIdParamsSchema,
  applyCouponSchema,
};
