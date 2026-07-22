const { Product } = require('../../models/product.model');
const { Category } = require('../../models/category.model');
const uploadService = require('../../integrations/cloudinary/uploadService');
const requestContext = require('../../utils/requestContext');
const slugify = require('../../utils/slugify');
const { recordActivityLog } = require('./activityLogService');
const quotaService = require('./quotaService');
const ApiError = require('../../utils/ApiError');

async function ensureUniqueSlug(baseSlug, excludeId) {
  let slug = baseSlug;
  let suffix = 1;
  while (await Product.findOne({ slug, _id: { $ne: excludeId } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

function productImageFolder() {
  return `tenants/${requestContext.getTenantId()}/products`;
}

async function assertCategoryExists(categoryId) {
  const exists = await Category.exists({ _id: categoryId });
  if (!exists) throw ApiError.badRequest('Selected category does not exist for this store');
}

async function createProduct({ imageFiles, actor, ...productData }) {
  await quotaService.assertProductQuota();
  await assertCategoryExists(productData.category);

  const slug = await ensureUniqueSlug(slugify(productData.name));

  let images = [];
  if (imageFiles && imageFiles.length > 0) {
    const uploaded = await uploadService.uploadMany(imageFiles, productImageFolder());
    images = uploaded.map((img, i) => ({ ...img, isPrimary: i === 0 }));
  }

  const product = await Product.create({ ...productData, slug, images });

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'product.created',
    targetType: 'Product',
    targetId: product._id,
    metadata: { name: product.name, slug },
  });

  return product;
}

async function listProducts({ page = 1, limit = 20, category, status, search, tag, minPrice, maxPrice, sort }) {
  const filter = {};
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (tag) filter.tags = tag;
  if (search) filter.$text = { $search: search };
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter['priceRange.min'] = {};
    if (minPrice !== undefined) filter['priceRange.min'].$gte = minPrice;
    if (maxPrice !== undefined) filter['priceRange.min'].$lte = maxPrice;
  }

  const sortMap = {
    newest: { createdAt: -1 },
    price_asc: { 'priceRange.min': 1 },
    price_desc: { 'priceRange.min': -1 },
    name_asc: { name: 1 },
  };
  const sortStage = sortMap[sort] || sortMap.newest;

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sortStage)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getProductById(id) {
  const product = await Product.findById(id).lean();
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

async function getProductBySlug(slug) {
  const product = await Product.findOne({ slug }).lean();
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

async function updateProduct({ id, updates, actor }) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  if (updates.category) await assertCategoryExists(updates.category);
  if (updates.name && updates.name !== product.name) {
    updates.slug = await ensureUniqueSlug(slugify(updates.name), id);
  }

  Object.assign(product, updates);
  await product.save();

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'product.updated',
    targetType: 'Product',
    targetId: product._id,
    metadata: { updates: Object.keys(updates) },
  });

  return product;
}

async function addImages({ id, imageFiles, actor }) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  const uploaded = await uploadService.uploadMany(imageFiles, productImageFolder());
  const hasPrimary = product.images.some((img) => img.isPrimary);
  uploaded.forEach((img, i) => {
    product.images.push({ ...img, isPrimary: !hasPrimary && i === 0 });
  });
  await product.save();

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'product.images_added',
    targetType: 'Product',
    targetId: product._id,
    metadata: { count: uploaded.length },
  });

  return product;
}

async function removeImage({ id, imageId, actor }) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  const image = product.images.id(imageId);
  if (!image) throw ApiError.notFound('Image not found on this product');

  await uploadService.deleteImage(image.publicId, 'image', image.bytes);
  image.deleteOne();
  await product.save();

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'product.image_removed',
    targetType: 'Product',
    targetId: product._id,
  });

  return product;
}

async function setStatus({ id, status, actor }) {
  const product = await Product.findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after' });
  if (!product) throw ApiError.notFound('Product not found');

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'product.status_changed',
    targetType: 'Product',
    targetId: product._id,
    metadata: { status },
  });

  return product;
}

async function duplicateProduct({ id, actor }) {
  const source = await Product.findById(id).lean();
  if (!source) throw ApiError.notFound('Product not found');

  const slug = await ensureUniqueSlug(`${slugify(source.name)}-copy`);
  const suffix = Date.now().toString(36).toUpperCase();

  const clone = {
    ...source,
    _id: undefined,
    slug,
    status: 'draft',
    ratingsAverage: 0,
    ratingsCount: 0,
    createdAt: undefined,
    updatedAt: undefined,
    variants: source.variants.map((v) => ({
      ...v,
      _id: undefined,
      sku: `${v.sku}-${suffix}`,
      stock: 0,
    })),
  };

  const product = await Product.create(clone);

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'product.duplicated',
    targetType: 'Product',
    targetId: product._id,
    metadata: { sourceProductId: id },
  });

  return product;
}

async function bulkUpdateStatus({ ids, status, actor }) {
  const result = await Product.updateMany({ _id: { $in: ids } }, { $set: { status } });

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'product.bulk_status_changed',
    metadata: { ids, status, matched: result.matchedCount },
  });

  return { matched: result.matchedCount, modified: result.modifiedCount };
}

async function bulkAssignCategory({ ids, categoryId, actor }) {
  await assertCategoryExists(categoryId);
  const result = await Product.updateMany({ _id: { $in: ids } }, { $set: { category: categoryId } });

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'product.bulk_category_assigned',
    metadata: { ids, categoryId, matched: result.matchedCount },
  });

  return { matched: result.matchedCount, modified: result.modifiedCount };
}

async function deleteProduct({ id, actor }) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw ApiError.notFound('Product not found');

  const allImages = [...product.images, ...product.variants.flatMap((v) => v.images)];
  const publicIds = allImages.map((img) => img.publicId);
  const totalBytes = allImages.reduce((sum, img) => sum + (img.bytes || 0), 0);
  await uploadService.deleteMany(publicIds, 'image', totalBytes);

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'product.deleted',
    targetType: 'Product',
    targetId: product._id,
  });
}

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  getProductBySlug,
  updateProduct,
  addImages,
  removeImage,
  setStatus,
  duplicateProduct,
  bulkUpdateStatus,
  bulkAssignCategory,
  deleteProduct,
};
