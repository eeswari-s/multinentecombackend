const mongoose = require('mongoose');

const { Schema } = mongoose;

const USER_ROLES = ['super_admin', 'owner', 'manager', 'support_staff'];

/**
 * Covers Super Admin, Client Admin and its sub-roles (owner/manager/
 * support_staff) in a single collection, per the project's folder layout.
 * This model intentionally does NOT use the tenantScope plugin: super_admin
 * documents have no tenant at all, so the plugin's "tenantId is always
 * required, always injected from context" contract doesn't fit. Every
 * tenant-scoped query against this collection (Client Admin login/staff
 * management) must explicitly include tenantId in its filter instead —
 * see adminAuthService.js and the Super Admin staff-management service.
 */
const userSchema = new Schema(
  {
    role: { type: String, enum: USER_ROLES, required: true },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: function tenantRequiredUnlessSuperAdmin() {
        return this.role !== 'super_admin';
      },
      validate: {
        validator: function tenantForbiddenForSuperAdmin(value) {
          return this.role !== 'super_admin' || !value;
        },
        message: 'super_admin users must not have a tenantId',
      },
    },

    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

// A super_admin has tenantId undefined; Mongo's unique index treats missing
// fields as null, so multiple super_admins still need unique emails among
// themselves — this compound index achieves that while also scoping
// Client Admin emails uniquely per tenant (two stores may reuse an email).
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, role: 1 });

userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

module.exports = { User, USER_ROLES };
