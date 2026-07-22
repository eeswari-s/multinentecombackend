const { CmsPage } = require('../../models/cmsPage.model');
const slugify = require('../../utils/slugify');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

async function ensureUniqueSlug(baseSlug, excludeId) {
  let slug = baseSlug;
  let suffix = 1;
  while (await CmsPage.findOne({ slug, _id: { $ne: excludeId } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

async function createPage({ title, content, isPublished, seo, actor }) {
  const slug = await ensureUniqueSlug(slugify(title));
  const page = await CmsPage.create({ title, slug, content, isPublished, seo });

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'cms_page.created',
    targetType: 'CmsPage',
    targetId: page._id,
  });

  return page;
}

async function listPages({ isPublished }) {
  const filter = {};
  if (isPublished !== undefined) filter.isPublished = isPublished;
  return CmsPage.find(filter).sort({ createdAt: -1 }).lean();
}

async function getPageById(id) {
  const page = await CmsPage.findById(id).lean();
  if (!page) throw ApiError.notFound('Page not found');
  return page;
}

async function updatePage({ id, updates, actor }) {
  const page = await CmsPage.findById(id);
  if (!page) throw ApiError.notFound('Page not found');

  if (updates.title && updates.title !== page.title) {
    updates.slug = await ensureUniqueSlug(slugify(updates.title), id);
  }

  Object.assign(page, updates);
  await page.save();

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'cms_page.updated',
    targetType: 'CmsPage',
    targetId: page._id,
  });

  return page;
}

async function deletePage({ id, actor }) {
  const page = await CmsPage.findByIdAndDelete(id);
  if (!page) throw ApiError.notFound('Page not found');

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'cms_page.deleted',
    targetType: 'CmsPage',
    targetId: page._id,
  });
}

async function getPublishedPageBySlug(slug) {
  const page = await CmsPage.findOne({ slug, isPublished: true }).lean();
  if (!page) throw ApiError.notFound('Page not found');
  return page;
}

module.exports = { createPage, listPages, getPageById, updatePage, deletePage, getPublishedPageBySlug };
