const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const reviewModerationService = require('../../services/clientAdmin/reviewModerationService');

const list = asyncHandler(async (req, res) => {
  const reviews = await reviewModerationService.listReviews(req.query);
  sendSuccess(res, { data: reviews });
});

const moderate = asyncHandler(async (req, res) => {
  const review = await reviewModerationService.moderateReview({
    id: req.params.id,
    status: req.body.status,
    adminReply: req.body.adminReply,
    actor: { userId: req.auth.userId, email: req.auth.email },
  });
  sendSuccess(res, { message: 'Review moderated', data: review });
});

module.exports = { list, moderate };
