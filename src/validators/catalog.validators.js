const { z } = require('zod');
const { PRODUCT_STATUSES } = require('../models/product.model');
const { MOVEMENT_TYPES } = require('../models/inventory.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const seoSchema = z
  .object({
    title: z.string().trim().optional(),
    description: z.string().trim().optional(),
    keywords: z.array(z.string().trim()).optional(),
  })
  .optional();

// ---- Category ----

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).optional(),
  parentCategory: objectId.nullable().optional(),
  seo: seoSchema,
});

const updateCategorySchema = createCategorySchema.partial();

const listCategoriesQuerySchema = z.object({
  parentCategory: objectId.optional(),
  isActive: z.coerce.boolean().optional(),
});

const categoryIdParamsSchema = z.object({ id: objectId });

// ---- Product ----

const variantInputSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  attributes: z.record(z.string(), z.string()).optional(),
  price: z.coerce.number().min(0),
  comparePrice: z.coerce.number().min(0).optional(),
  offerPrice: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().int().min(0).default(0),
  weightGrams: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

const gstSchema = z
  .object({
    rate: z.coerce.number().min(0).max(100).optional(),
    hsnCode: z.string().trim().optional(),
  })
  .optional();

const shippingSchema = z
  .object({
    weightGrams: z.coerce.number().min(0).optional(),
    dimensionsCm: z
      .object({
        length: z.coerce.number().min(0).optional(),
        width: z.coerce.number().min(0).optional(),
        height: z.coerce.number().min(0).optional(),
      })
      .optional(),
    isFreeShipping: z.boolean().optional(),
    shippingClass: z.string().trim().optional(),
  })
  .optional();

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(100).optional(),
  category: objectId,
  description: z.string().trim().max(10000).optional(),
  highlights: z.array(z.string().trim()).optional(),
  faqs: z.array(z.object({ question: z.string().trim(), answer: z.string().trim() })).optional(),
  tags: z.array(z.string().trim().toLowerCase()).optional(),
  variants: z.array(variantInputSchema).min(1, 'At least one variant is required'),
  gst: gstSchema,
  shipping: shippingSchema,
  seo: seoSchema,
  status: z.enum(PRODUCT_STATUSES).optional(),
  isFeatured: z.boolean().optional(),
});

const updateProductSchema = createProductSchema.partial();

const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: objectId.optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  search: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name_asc']).optional(),
});

const productIdParamsSchema = z.object({ id: objectId });
const productImageParamsSchema = z.object({ id: objectId, imageId: objectId });

const setProductStatusSchema = z.object({ status: z.enum(PRODUCT_STATUSES) });

const bulkStatusSchema = z.object({
  ids: z.array(objectId).min(1),
  status: z.enum(PRODUCT_STATUSES),
});

const bulkCategorySchema = z.object({
  ids: z.array(objectId).min(1),
  categoryId: objectId,
});

// ---- Inventory ----

const adjustStockSchema = z.object({
  productId: objectId,
  sku: z.string().trim().min(1),
  quantityChange: z.coerce.number().int().refine((v) => v !== 0, 'quantityChange must be non-zero'),
  type: z.enum(MOVEMENT_TYPES),
  reason: z.string().trim().max(500).optional(),
});

const movementsQuerySchema = z.object({
  productId: objectId.optional(),
  sku: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = {
  createCategorySchema,
  updateCategorySchema,
  listCategoriesQuerySchema,
  categoryIdParamsSchema,
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  productIdParamsSchema,
  productImageParamsSchema,
  setProductStatusSchema,
  bulkStatusSchema,
  bulkCategorySchema,
  adjustStockSchema,
  movementsQuerySchema,
};
