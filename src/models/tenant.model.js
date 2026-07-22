const mongoose = require('mongoose');

const { Schema } = mongoose;

// 'past_due' = grace period: the trial/billing period has ended but the
// storefront still has full access while the tenant is given a chance to
// pay. 'expired' = the grace period itself has also elapsed with no
// payment — the storefront becomes read-only (browsing still works,
// checkout does not) until payment succeeds and flips it back to 'active'.
const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'expired', 'suspended', 'cancelled'];
const BILLING_CYCLES = ['monthly', 'quarterly', 'half_yearly', 'yearly', 'lifetime'];
const TENANT_STATUSES = ['active', 'suspended', 'deleted'];

const tenantSchema = new Schema(
  {
    businessName: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: { type: String, trim: true },
    gst: {
      number: { type: String, trim: true, uppercase: true },
      registeredAddress: { type: String, trim: true },
    },
    address: {
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true, default: 'IN' },
      pincode: { type: String, trim: true },
    },

    domain: {
      subdomain: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        match: [/^[a-z0-9-]+$/, 'Subdomain may only contain lowercase letters, numbers and hyphens'],
      },
      customDomain: {
        type: String,
        lowercase: true,
        trim: true,
      },
      // A custom domain is only used for tenant resolution once verified —
      // otherwise any Client Admin could claim a domain they don't actually
      // control (domain/subdomain-takeover risk). TLS termination for a
      // verified custom domain is an infrastructure-layer concern (reverse
      // proxy / CDN in front of this backend), out of scope here.
      customDomainVerified: { type: Boolean, default: false },
      customDomainVerificationToken: { type: String, default: null },
    },

    subscription: {
      planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
      billingCycle: { type: String, enum: BILLING_CYCLES },
      status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'trial', required: true },
      trialEndsAt: { type: Date },
      currentPeriodStart: { type: Date },
      currentPeriodEnd: { type: Date },
      cancelledAt: { type: Date },
      // Set when status transitions to 'past_due' — the grace-period
      // deadline after which the renewal job flips status to 'expired'.
      gracePeriodEndsAt: { type: Date, default: null },
    },

    featureFlags: {
      type: Map,
      of: Boolean,
      default: {},
    },

    razorpayConfigRef: { type: Schema.Types.ObjectId, ref: 'RazorpayConfig', default: null },
    brevoConfigRef: { type: Schema.Types.ObjectId, ref: 'BrevoConfig', default: null },

    status: { type: String, enum: TENANT_STATUSES, default: 'active', required: true },

    invoicePrefix: { type: String, trim: true, uppercase: true, default: 'INV' },

    branding: {
      logoUrl: { type: String, default: null },
      logoPublicId: { type: String, default: null },
      logoBytes: { type: Number, default: 0 },
      brandColor: { type: String, trim: true, default: '#111111' },
    },

    shippingSettings: {
      flatRate: { type: Number, default: 49, min: 0 },
      freeShippingThreshold: { type: Number, default: 999, min: 0 },
    },

    // Running total of bytes stored in Cloudinary on this tenant's behalf —
    // incremented/decremented by uploadService alongside every upload/
    // delete, so plan-tier storage quota can be checked cheaply without a
    // live Cloudinary API call per request.
    storageUsedBytes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

tenantSchema.index({ 'domain.subdomain': 1 }, { unique: true });
tenantSchema.index({ 'domain.customDomain': 1 }, { unique: true, sparse: true });
tenantSchema.index({ status: 1 });
tenantSchema.index({ 'subscription.status': 1 });

tenantSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Tenant = mongoose.model('Tenant', tenantSchema);

module.exports = { Tenant, SUBSCRIPTION_STATUSES, BILLING_CYCLES, TENANT_STATUSES };
