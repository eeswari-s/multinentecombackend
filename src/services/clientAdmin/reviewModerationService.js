const { Review } = require('../../models/review.model');
const { recomputeProductRating } = require('../reviewRatingService');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

async function listReviews({ status, productId }) {
  const filter = {};
  if (status) filter.status = status;
  if (productId) filter.productId = productId;
  return Review.find(filter).sort({ createdAt: -1 }).lean();
}

async function moderateReview({ id, status, adminReply, actor }) {
  const review = await Review.findById(id);
  if (!review) throw ApiError.notFound('Review not found');

  review.status = status;
  if (adminReply !== undefined) review.adminReply = adminReply;
  await review.save();

  await recomputeProductRating(review.productId);

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'review.moderated',
    targetType: 'Review',
    targetId: review._id,
    metadata: { status },
  });

  return review;
}

module.exports = { listReviews, moderateReview };
