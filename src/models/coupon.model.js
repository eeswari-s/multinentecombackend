const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const DISCOUNT_TYPES = ['percentage', 'fixed'];

const couponSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, trim: true },
    discountType: { type: String, enum: DISCOUNT_TYPES, required: true },
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscountAmount: { type: Number, default: null, min: 0 }, // cap for percentage coupons
    minOrderValue: { type: Number, default: 0, min: 0 },
    usageLimit: { type: Number, default: null, min: 1 }, // total redemptions across all customers
    usageCount: { type: Number, default: 0, min: 0 },
    perCustomerLimit: { type: Number, default: 1, min: 1 },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    // Whether this coupon appears in the customer-facing "available coupons"
    // listing, vs. a code only ever handed out privately (support, campaigns).
    isPublic: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.plugin(tenantScopePlugin);

couponSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = { Coupon, DISCOUNT_TYPES };
