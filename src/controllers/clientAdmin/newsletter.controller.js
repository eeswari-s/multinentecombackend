const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const { NewsletterSubscriber } = require('../../models/newsletterSubscriber.model');

const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const filter = { isActive: true };

  const [items, total] = await Promise.all([
    NewsletterSubscriber.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NewsletterSubscriber.countDocuments(filter),
  ]);

  sendSuccess(res, { data: { items, total, page, limit } });
});

module.exports = { list };
