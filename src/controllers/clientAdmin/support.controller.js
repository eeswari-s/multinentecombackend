const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const supportService = require('../../services/clientAdmin/supportService');

const list = asyncHandler(async (req, res) => {
  const result = await supportService.listEnquiries(req.query);
  sendSuccess(res, { data: result });
});

const reply = asyncHandler(async (req, res) => {
  const enquiry = await supportService.replyToEnquiry({
    id: req.params.id,
    adminReply: req.body.adminReply,
    actor: { userId: req.auth.userId, email: req.auth.email },
  });
  sendSuccess(res, { message: 'Reply sent', data: enquiry });
});

module.exports = { list, reply };
