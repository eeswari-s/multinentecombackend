const { z } = require('zod');
const { REVIEW_STATUSES } = require('../models/review.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createReviewSchema = z.object({
  productId: objectId,
  orderId: objectId,
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

const listReviewsQuerySchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  productId: objectId.optional(),
});

const productIdParamsSchema = z.object({ productId: objectId });
const reviewIdParamsSchema = z.object({ id: objectId });

const moderateReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  adminReply: z.string().trim().max(2000).optional(),
});

module.exports = {
  createReviewSchema,
  listReviewsQuerySchema,
  productIdParamsSchema,
  reviewIdParamsSchema,
  moderateReviewSchema,
};
