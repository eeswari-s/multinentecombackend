const mongoose = require('mongoose');
const { BILLING_CYCLES } = require('./tenant.model');

const { Schema } = mongoose;

/**
 * Platform-level catalog of subscription plans — not tenant-scoped, managed
 * exclusively by Super Admin. Tenants reference a plan via
 * tenant.subscription.planId.
 */
const subscriptionPlanSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    pricing: {
      type: Map,
      of: Number, // billingCycle -> price in the smallest currency unit (paise)
      required: true,
    },

    limits: {
      maxProducts: { type: Number, default: null },
      maxStaffUsers: { type: Number, default: null },
      maxOrdersPerMonth: { type: Number, default: null },
      maxStorageMB: { type: Number, default: null },
    },

    features: {
      type: [String],
      default: [],
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

subscriptionPlanSchema.pre('validate', function validateBillingCycleKeys() {
  if (!this.pricing) return;
  for (const cycle of this.pricing.keys()) {
    if (!BILLING_CYCLES.includes(cycle)) {
      this.invalidate('pricing', `"${cycle}" is not a valid billing cycle`);
    }
  }
});

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

module.exports = { SubscriptionPlan };



