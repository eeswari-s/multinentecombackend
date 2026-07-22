const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const seoSchema = z
  .object({
    title: z.string().trim().optional(),
    description: z.string().trim().optional(),
  })
  .optional();

const createCmsPageSchema = z.object({
  title: z.string().trim().min(1).max(150),
  content: z.string().min(1),
  isPublished: z.boolean().optional(),
  seo: seoSchema,
});

const updateCmsPageSchema = createCmsPageSchema.partial();

const listCmsPagesQuerySchema = z.object({
  isPublished: z.coerce.boolean().optional(),
});

const cmsPageIdParamsSchema = z.object({ id: objectId });
const cmsPageSlugParamsSchema = z.object({ slug: z.string().trim().min(1) });

module.exports = {
  createCmsPageSchema,
  updateCmsPageSchema,
  listCmsPagesQuerySchema,
  cmsPageIdParamsSchema,
  cmsPageSlugParamsSchema,
};
