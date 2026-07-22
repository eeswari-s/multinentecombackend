const { Review } = require('../models/review.model');
const { Product } = require('../models/product.model');

/** Recomputes a product's denormalized rating fields from its approved reviews. */
async function recomputeProductRating(productId) {
  const stats = await Review.aggregate([
    { $match: { productId, status: 'approved' } },
    { $group: { _id: '$productId', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const { average = 0, count = 0 } = stats[0] || {};
  await Product.findByIdAndUpdate(productId, {
    $set: { ratingsAverage: Math.round(average * 10) / 10, ratingsCount: count },
  });
}

module.exports = { recomputeProductRating };
