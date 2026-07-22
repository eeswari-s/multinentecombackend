const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Singleton document (never tenant-scoped — this is platform-wide config,
 * not per-store) holding the handful of settings Super Admin can change at
 * runtime without a redeploy. Fetched/updated via findOneAndUpdate({}, ...,
 * {upsert: true}), same singleton pattern used for per-tenant Razorpay/Brevo
 * config, just without a tenantId.
 */
const platformSettingsSchema = new Schema(
  {
    maintenanceMode: {
      enabled: { type: Boolean, default: false },
      message: { type: String, trim: true, default: 'The platform is currently undergoing maintenance.' },
    },
    defaultTrialDays: { type: Number, default: 14, min: 0 },
    subscriptionGraceDays: { type: Number, default: 3, min: 0 },
    abandonedCartThresholdHours: { type: Number, default: 24, min: 1 },
    defaultCurrency: { type: String, trim: true, default: 'INR' },
    supportEmail: { type: String, trim: true, lowercase: true, default: null },
    supportPhone: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);

module.exports = { PlatformSettings };
