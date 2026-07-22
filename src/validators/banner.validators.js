const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const positionEnum = z.enum(['home_top', 'home_middle', 'category_page']);

const createBannerSchema = z.object({
  title: z.string().trim().min(1).max(150),
  linkUrl: z.string().trim().url().optional(),
  position: positionEnum.optional(),
  sortOrder: z.coerce.number().int().optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
});

const updateBannerSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  linkUrl: z.string().trim().url().optional(),
  position: positionEnum.optional(),
  sortOrder: z.coerce.number().int().optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});

const listBannersQuerySchema = z.object({
  position: positionEnum.optional(),
  isActive: z.coerce.boolean().optional(),
});

const bannerIdParamsSchema = z.object({ id: objectId });

module.exports = { createBannerSchema, updateBannerSchema, listBannersQuerySchema, bannerIdParamsSchema };
