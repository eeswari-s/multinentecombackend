const { Review } = require('../../models/review.model');
const { Order } = require('../../models/order.model');
const ApiError = require('../../utils/ApiError');

const REVIEWABLE_STATUSES = ['delivered'];

async function createReview({ customerId, productId, orderId, rating, comment }) {
  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order || !REVIEWABLE_STATUSES.includes(order.status)) {
    throw ApiError.badRequest('You can only review products from a delivered order');
  }
  const purchasedThisProduct = order.items.some((item) => String(item.productId) === String(productId));
  if (!purchasedThisProduct) {
    throw ApiError.badRequest('This product was not part of that order');
  }

  const existing = await Review.findOne({ customerId, productId, orderId });
  if (existing) throw ApiError.conflict('You have already reviewed this product for this order');

  return Review.create({ productId, customerId, orderId, rating, comment });
}

async function listMyReviews(customerId) {
  return Review.find({ customerId }).sort({ createdAt: -1 }).lean();
}

/** Public: approved reviews for a product's page. */
async function listApprovedReviewsForProduct(productId) {
  return Review.find({ productId, status: 'approved' })
    .select('rating comment createdAt')
    .sort({ createdAt: -1 })
    .lean();
}

module.exports = { createReview, listMyReviews, listApprovedReviewsForProduct };
