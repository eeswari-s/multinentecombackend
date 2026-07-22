const { Category } = require('../../models/category.model');
const { Product } = require('../../models/product.model');
const uploadService = require('../../integrations/cloudinary/uploadService');
const requestContext = require('../../utils/requestContext');
const slugify = require('../../utils/slugify');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

async function ensureUniqueSlug(baseSlug, excludeId) {
  let slug = baseSlug;
  let suffix = 1;
  // Category queries are already tenant-scoped by the tenantScope plugin.
  while (await Category.findOne({ slug, _id: { $ne: excludeId } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

async function createCategory({ name, description, parentCategory, seo, imageFile, actor }) {
  const baseSlug = slugify(name);
  const slug = await ensureUniqueSlug(baseSlug);

  let image;
  if (imageFile) {
    const uploaded = await uploadService.uploadBuffer(
      imageFile.buffer,
      `tenants/${requestContext.getTenantId()}/categories`
    );
    image = uploaded;
  }

  const category = await Category.create({ name, slug, description, parentCategory, seo, image });

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'category.created',
    targetType: 'Category',
    targetId: category._id,
    metadata: { name, slug },
  });

  return category;
}

async function listCategories({ parentCategory, isActive }) {
  const filter = {};
  if (parentCategory !== undefined) filter.parentCategory = parentCategory || null;
  if (isActive !== undefined) filter.isActive = isActive;

  return Category.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
}

async function getCategoryById(id) {
  const category = await Category.findById(id).lean();
  if (!category) throw ApiError.notFound('Category not found');
  return category;
}

async function updateCategory({ id, updates, imageFile, actor }) {
  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');

  if (updates.name && updates.name !== category.name) {
    updates.slug = await ensureUniqueSlug(slugify(updates.name), id);
  }

  if (imageFile) {
    const previousImage = category.image;
    updates.image = await uploadService.uploadBuffer(
      imageFile.buffer,
      `tenants/${requestContext.getTenantId()}/categories`
    );
    if (previousImage?.publicId) await uploadService.deleteImage(previousImage.publicId, 'image', previousImage.bytes);
  }

  Object.assign(category, updates);
  await category.save();

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'category.updated',
    targetType: 'Category',
    targetId: category._id,
    metadata: { updates: Object.keys(updates) },
  });

  return category;
}

async function deleteCategory({ id, actor }) {
  const inUse = await Product.exists({ category: id });
  if (inUse) {
    throw ApiError.conflict('Cannot delete a category that still has products assigned to it');
  }

  const category = await Category.findByIdAndDelete(id);
  if (!category) throw ApiError.notFound('Category not found');

  if (category.image?.publicId) await uploadService.deleteImage(category.image.publicId, 'image', category.image.bytes);

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'category.deleted',
    targetType: 'Category',
    targetId: category._id,
  });
}

module.exports = { createCategory, listCategories, getCategoryById, updateCategory, deleteCategory };
