const { Coupon } = require('../../models/coupon.model');
const { Order } = require('../../models/order.model');
const ApiError = require('../../utils/ApiError');

async function validateCoupon({ code, customerId, itemsTotal }) {
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) throw ApiError.notFound('Invalid coupon code');

  const now = new Date();
  if (coupon.validFrom && now < coupon.validFrom) throw ApiError.badRequest('This coupon is not active yet');
  if (coupon.validUntil && now > coupon.validUntil) throw ApiError.badRequest('This coupon has expired');
  if (itemsTotal < coupon.minOrderValue) {
    throw ApiError.badRequest(`This coupon requires a minimum order value of ₹${coupon.minOrderValue}`);
  }
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    throw ApiError.badRequest('This coupon has reached its usage limit');
  }

  const customerUsageCount = await Order.countDocuments({
    customerId,
    couponCode: coupon.code,
    status: { $ne: 'cart' },
  });
  if (customerUsageCount >= coupon.perCustomerLimit) {
    throw ApiError.badRequest('You have already used this coupon the maximum number of times');
  }

  return coupon;
}

function calculateDiscount(coupon, itemsTotal) {
  let discount =
    coupon.discountType === 'percentage' ? (itemsTotal * coupon.discountValue) / 100 : coupon.discountValue;
  if (coupon.maxDiscountAmount != null) discount = Math.min(discount, coupon.maxDiscountAmount);
  return Math.min(discount, itemsTotal);
}

/** Customer-facing "available coupons" listing — public, active, in-window codes only. */
async function listPublicCoupons() {
  const now = new Date();
  return Coupon.find({
    isActive: true,
    isPublic: true,
    $and: [
      { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
      { $or: [{ validUntil: null }, { validUntil: { $gte: now } }] },
    ],
  })
    .select('code description discountType discountValue maxDiscountAmount minOrderValue validUntil')
    .sort({ createdAt: -1 })
    .lean();
}

module.exports = { validateCoupon, calculateDiscount, listPublicCoupons };
