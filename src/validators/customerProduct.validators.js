const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: objectId.optional(),
  brand: z.string().trim().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(50).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  hasDiscount: z.coerce.boolean().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'rating_desc', 'name_asc']).optional(),
});

const searchSuggestionsQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});

const productSlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

const shareProductSchema = z.object({
  productId: objectId,
  sessionId: z.string().trim().min(1).max(100),
});

module.exports = {
  listProductsQuerySchema,
  searchSuggestionsQuerySchema,
  productSlugParamsSchema,
  shareProductSchema,
};
