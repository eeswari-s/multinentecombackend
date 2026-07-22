const { BlogPost } = require('../../models/blogPost.model');
const ApiError = require('../../utils/ApiError');

async function listPublishedPosts({ page = 1, limit = 20 }) {
  const filter = { status: 'published' };
  const [items, total] = await Promise.all([
    BlogPost.find(filter)
      .select('title slug excerpt coverImage tags publishedAt')
      .sort({ publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    BlogPost.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

async function getPublishedPostBySlug(slug) {
  const post = await BlogPost.findOne({ slug, status: 'published' }).lean();
  if (!post) throw ApiError.notFound('Blog post not found');
  return post;
}

module.exports = { listPublishedPosts, getPublishedPostBySlug };
