const { z } = require('zod');
const { OFFER_TYPES, DISCOUNT_TYPES } = require('../models/offer.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createOfferSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    type: z.enum(OFFER_TYPES),
    description: z.string().trim().max(500).optional(),
    applicableProducts: z.array(objectId).optional(),
    discountType: z.enum(DISCOUNT_TYPES).optional(),
    discountValue: z.coerce.number().min(0).optional(),
    comboProductIds: z.array(objectId).optional(),
    buyProductId: objectId.optional(),
    buyQuantity: z.coerce.number().int().min(1).optional(),
    getProductId: objectId.optional(),
    getQuantity: z.coerce.number().int().min(1).optional(),
    getDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.endAt > data.startAt, { message: 'endAt must be after startAt', path: ['endAt'] });

const listOffersQuerySchema = z.object({
  isActive: z.coerce.boolean().optional(),
});

const offerIdParamsSchema = z.object({ id: objectId });

module.exports = { createOfferSchema, listOffersQuerySchema, offerIdParamsSchema };
