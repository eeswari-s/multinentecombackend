const { Coupon } = require('../../models/coupon.model');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

async function createCoupon({ code, actor, ...rest }) {
  const existing = await Coupon.findOne({ code: code.toUpperCase() });
  if (existing) throw ApiError.conflict('A coupon with this code already exists');

  const coupon = await Coupon.create({ code: code.toUpperCase(), ...rest });

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'coupon.created',
    targetType: 'Coupon',
    targetId: coupon._id,
    metadata: { code: coupon.code },
  });

  return coupon;
}

async function listCoupons({ isActive }) {
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  return Coupon.find(filter).sort({ createdAt: -1 }).lean();
}

async function updateCoupon({ id, updates, actor }) {
  const coupon = await Coupon.findByIdAndUpdate(id, { $set: updates }, { returnDocument: 'after', runValidators: true });
  if (!coupon) throw ApiError.notFound('Coupon not found');

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'coupon.updated',
    targetType: 'Coupon',
    targetId: coupon._id,
  });

  return coupon;
}

async function deleteCoupon({ id, actor }) {
  const coupon = await Coupon.findByIdAndDelete(id);
  if (!coupon) throw ApiError.notFound('Coupon not found');

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'coupon.deleted',
    targetType: 'Coupon',
    targetId: coupon._id,
  });
}

module.exports = { createCoupon, listCoupons, updateCoupon, deleteCoupon };
