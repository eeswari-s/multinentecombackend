const { z } = require('zod');
const { BLOG_STATUSES } = require('../models/blogPost.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const coverImageSchema = z
  .object({
    url: z.string().trim().url().optional(),
    publicId: z.string().trim().optional(),
  })
  .optional();

const createBlogPostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().max(500).optional(),
  content: z.string().trim().min(1),
  coverImage: coverImageSchema,
  tags: z.array(z.string().trim()).optional(),
  status: z.enum(BLOG_STATUSES).optional(),
});

const updateBlogPostSchema = createBlogPostSchema.partial();

const listBlogPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(BLOG_STATUSES).optional(),
});

const blogPostIdParamsSchema = z.object({ id: objectId });
const blogPostSlugParamsSchema = z.object({ slug: z.string().trim().min(1) });

module.exports = {
  createBlogPostSchema,
  updateBlogPostSchema,
  listBlogPostsQuerySchema,
  blogPostIdParamsSchema,
  blogPostSlugParamsSchema,
};
