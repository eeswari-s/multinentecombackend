const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const reviewService = require('../../services/customer/reviewService');

const create = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview({ customerId: req.auth.userId, ...req.body });
  sendSuccess(res, { statusCode: 201, message: 'Review submitted for moderation', data: review });
});

const listMine = asyncHandler(async (req, res) => {
  const reviews = await reviewService.listMyReviews(req.auth.userId);
  sendSuccess(res, { data: reviews });
});

const listForProduct = asyncHandler(async (req, res) => {
  const reviews = await reviewService.listApprovedReviewsForProduct(req.params.productId);
  sendSuccess(res, { data: reviews });
});

module.exports = { create, listMine, listForProduct };
