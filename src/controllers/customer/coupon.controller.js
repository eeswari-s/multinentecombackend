const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const { listPublicCoupons } = require('../../services/customer/couponApplicationService');

const list = asyncHandler(async (req, res) => {
  const coupons = await listPublicCoupons();
  sendSuccess(res, { data: coupons });
});

module.exports = { list };
