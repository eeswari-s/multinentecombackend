const { Product } = require('../../models/product.model');
const { Category } = require('../../models/category.model');
const ApiError = require('../../utils/ApiError');

const PUBLISHED_SELECT =
  'name slug brand category description highlights faqs tags images variants gst shipping seo priceRange totalStock ratingsAverage ratingsCount createdAt';

function buildFilter({ category, brand, search, tag, minPrice, maxPrice, minRating, hasDiscount }) {
  const filter = { status: 'published' };
  if (category) filter.category = category;
  if (brand) filter.brand = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (tag) filter.tags = tag;
  if (search) filter.$text = { $search: search };
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter['priceRange.min'] = {};
    if (minPrice !== undefined) filter['priceRange.min'].$gte = minPrice;
    if (maxPrice !== undefined) filter['priceRange.min'].$lte = maxPrice;
  }
  if (minRating !== undefined) filter.ratingsAverage = { $gte: minRating };
  if (hasDiscount) filter['variants.offerPrice'] = { $ne: null };

  return filter;
}

async function listProducts({
  page = 1,
  limit = 20,
  category,
  brand,
  search,
  tag,
  minPrice,
  maxPrice,
  minRating,
  hasDiscount,
  sort,
}) {
  const filter = buildFilter({ category, brand, search, tag, minPrice, maxPrice, minRating, hasDiscount });

  const sortMap = {
    newest: { createdAt: -1 },
    price_asc: { 'priceRange.min': 1 },
    price_desc: { 'priceRange.min': -1 },
    rating_desc: { ratingsAverage: -1 },
    name_asc: { name: 1 },
  };
  const sortStage = sortMap[sort] || sortMap.newest;

  const [items, total] = await Promise.all([
    Product.find(filter)
      .select(PUBLISHED_SELECT)
      .sort(sortStage)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/** Lightweight autocomplete — name-prefix/contains match, top few hits only. */
async function searchSuggestions(query) {
  if (!query || query.trim().length < 2) return [];

  const regex = new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return Product.find({ status: 'published', name: regex })
    .select('name slug')
    .limit(8)
    .lean();
}

async function getProductBySlug(slug) {
  const product = await Product.findOne({ slug, status: 'published' }).select(PUBLISHED_SELECT).lean();
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

async function getSimilarProducts(product, limit = 8) {
  return Product.find({ status: 'published', category: product.category, _id: { $ne: product._id } })
    .select('name slug brand images priceRange ratingsAverage ratingsCount')
    .limit(limit)
    .lean();
}

async function listCategories() {
  return Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
}

async function listFeaturedProducts(limit = 12) {
  return Product.find({ status: 'published', isFeatured: true })
    .select('name slug brand images priceRange ratingsAverage ratingsCount')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

module.exports = {
  listProducts,
  searchSuggestions,
  getProductBySlug,
  getSimilarProducts,
  listCategories,
  listFeaturedProducts,
};
