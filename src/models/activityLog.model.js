const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

/**
 * Tenant-scoped record of Client Admin actions within their own store
 * (staff changes, catalog edits, order updates, settings changes — section
 * 8: "activity log for tenant-scoped admin actions"). Unlike AuditLog, this
 * IS tenant-scoped and visible to the tenant itself via Client Admin's own
 * activity log endpoint.
 */
const activityLogSchema = new Schema(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true, trim: true },
    targetType: { type: String, trim: true },
    targetId: { type: Schema.Types.ObjectId },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

activityLogSchema.plugin(tenantScopePlugin);

activityLogSchema.index({ tenantId: 1, createdAt: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = { ActivityLog };
