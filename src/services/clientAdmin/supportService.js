const { SupportEnquiry } = require('../../models/supportEnquiry.model');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

async function listEnquiries({ page = 1, limit = 20, type, status }) {
  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    SupportEnquiry.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SupportEnquiry.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function replyToEnquiry({ id, adminReply, actor }) {
  const enquiry = await SupportEnquiry.findByIdAndUpdate(
    id,
    { $set: { adminReply, status: 'resolved' } },
    { returnDocument: 'after' }
  );
  if (!enquiry) throw ApiError.notFound('Enquiry not found');

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'support_enquiry.resolved',
    targetType: 'SupportEnquiry',
    targetId: enquiry._id,
  });

  return enquiry;
}

module.exports = { listEnquiries, replyToEnquiry };
