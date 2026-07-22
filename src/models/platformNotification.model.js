const mongoose = require('mongoose');

const { Schema } = mongoose;

const NOTIFICATION_TYPES = [
  'tenant_created',
  'subscription_payment_failed',
  'subscription_renewal_due',
  'subscription_trial_expired',
];

/**
 * Super Admin's own notification feed — distinct from AuditLog (an
 * immutable record of what happened) and ActivityLog (tenant-scoped admin
 * actions). Not tenant-scoped: this is platform-level data for Super Admin
 * users only, generated automatically at key platform events.
 */
const platformNotificationSchema = new Schema(
  {
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

platformNotificationSchema.index({ isRead: 1, createdAt: -1 });

const PlatformNotification = mongoose.model('PlatformNotification', platformNotificationSchema);

module.exports = { PlatformNotification, NOTIFICATION_TYPES };
