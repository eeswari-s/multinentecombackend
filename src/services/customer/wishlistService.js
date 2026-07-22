const { WishlistItem } = require('../../models/wishlist.model');
const { Product } = require('../../models/product.model');
const ApiError = require('../../utils/ApiError');

async function addToWishlist({ customerId, productId }) {
  const product = await Product.findOne({ _id: productId, status: 'published' }).lean();
  if (!product) throw ApiError.notFound('Product not found');

  const existing = await WishlistItem.findOne({ customerId, productId });
  if (existing) return existing;

  return WishlistItem.create({ customerId, productId });
}

async function removeFromWishlist({ customerId, productId }) {
  await WishlistItem.deleteOne({ customerId, productId });
}

async function listWishlist(customerId) {
  const items = await WishlistItem.find({ customerId }).sort({ createdAt: -1 }).lean();
  const productIds = items.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIds }, status: 'published' })
    .select('name slug brand images priceRange ratingsAverage ratingsCount')
    .lean();
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  return items
    .map((item) => ({ wishlistItemId: item._id, addedAt: item.createdAt, product: productsById.get(String(item.productId)) }))
    .filter((entry) => entry.product);
}

module.exports = { addToWishlist, removeFromWishlist, listWishlist };
