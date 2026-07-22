const { BlogPost } = require('../../models/blogPost.model');
const slugify = require('../../utils/slugify');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

async function ensureUniqueSlug(baseSlug, excludeId) {
  let slug = baseSlug;
  let suffix = 1;
  while (await BlogPost.findOne({ slug, _id: { $ne: excludeId } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

async function createPost({ title, excerpt, content, coverImage, tags, status, actor }) {
  const slug = await ensureUniqueSlug(slugify(title));
  const post = await BlogPost.create({
    title,
    slug,
    excerpt,
    content,
    coverImage,
    tags,
    status,
    authorUserId: actor.userId,
    publishedAt: status === 'published' ? new Date() : null,
  });

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'blog_post.created',
    targetType: 'BlogPost',
    targetId: post._id,
  });

  return post;
}

async function listPosts({ status, page = 1, limit = 20 }) {
  const filter = {};
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    BlogPost.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    BlogPost.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getPostById(id) {
  const post = await BlogPost.findById(id).lean();
  if (!post) throw ApiError.notFound('Blog post not found');
  return post;
}

async function updatePost({ id, updates, actor }) {
  const post = await BlogPost.findById(id);
  if (!post) throw ApiError.notFound('Blog post not found');

  if (updates.title && updates.title !== post.title) {
    updates.slug = await ensureUniqueSlug(slugify(updates.title), id);
  }
  if (updates.status === 'published' && post.status !== 'published') {
    updates.publishedAt = new Date();
  }

  Object.assign(post, updates);
  await post.save();

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'blog_post.updated',
    targetType: 'BlogPost',
    targetId: post._id,
  });

  return post;
}

async function deletePost({ id, actor }) {
  const post = await BlogPost.findByIdAndDelete(id);
  if (!post) throw ApiError.notFound('Blog post not found');

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'blog_post.deleted',
    targetType: 'BlogPost',
    targetId: post._id,
  });
}

module.exports = { createPost, listPosts, getPostById, updatePost, deletePost };
