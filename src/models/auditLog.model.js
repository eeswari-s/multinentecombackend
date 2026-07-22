const mongoose = require('mongoose');

const { Schema } = mongoose;

const AUDIT_ACTIONS = [
  'tenant.created',
  'tenant.updated',
  'tenant.suspended',
  'tenant.activated',
  'tenant.deleted',
  'tenant.owner_password_reset',
  'subscription.plan_assigned',
  'subscription.status_changed',
  'feature_flag.updated',
  'impersonation.started',
  'platform_staff.created',
  'platform_staff.deactivated',
  'subscription.trial_expired',
  'subscription.period_expired',
  'subscription.renewal_due',
  'subscription.payment_failed',
  'platform_settings.updated',
];

/**
 * Platform-level record of every sensitive Super Admin action (client
 * suspension, plan change, impersonation, config changes — section 8).
 * Deliberately NOT tenant-scoped (no tenantScope plugin): this is Super
 * Admin's own data, never queryable from a Client Admin or Customer code
 * path. `tenantId` is stored as plain reference metadata (nullable) purely
 * to filter "actions affecting tenant X", not as an isolation boundary.
 */
const auditLogSchema = new Schema(
  {
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    // Null for system/cron-triggered entries (e.g. automatic trial
    // expiry) — there is no human actor for those.
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorEmail: { type: String, required: true, default: 'system' },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = { AuditLog, AUDIT_ACTIONS };
