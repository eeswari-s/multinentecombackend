const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const couponService = require('../../services/clientAdmin/couponService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

const create = asyncHandler(async (req, res) => {
  const coupon = await couponService.createCoupon({ ...req.body, actor: actorFrom(req) });
  sendSuccess(res, { statusCode: 201, message: 'Coupon created', data: coupon });
});

const list = asyncHandler(async (req, res) => {
  const coupons = await couponService.listCoupons(req.query);
  sendSuccess(res, { data: coupons });
});

const update = asyncHandler(async (req, res) => {
  const coupon = await couponService.updateCoupon({ id: req.params.id, updates: req.body, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Coupon updated', data: coupon });
});

const remove = asyncHandler(async (req, res) => {
  await couponService.deleteCoupon({ id: req.params.id, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Coupon deleted' });
});

module.exports = { create, list, update, remove };
