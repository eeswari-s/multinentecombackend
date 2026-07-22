const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const supportService = require('../../services/customer/supportService');

const create = asyncHandler(async (req, res) => {
  const customerId = req.auth?.persona === 'customer' ? req.auth.userId : null;
  const enquiry = await supportService.createEnquiry({ customerId, ...req.body });
  sendSuccess(res, { statusCode: 201, message: 'Your enquiry has been submitted', data: enquiry });
});

module.exports = { create };
