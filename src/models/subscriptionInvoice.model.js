const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const SUBSCRIPTION_INVOICE_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

/**
 * Records of the SaaS owner charging a TENANT for their subscription
 * (Flow A — the platform's own Razorpay account, env.razorpay.platform*).
 * Tenant-scoped so a Client Admin can view their own billing history via
 * Client Admin routes; Super Admin's cross-tenant payment history view
 * goes through the narrow crossTenantAccess bypass, same as any other
 * tenant-scoped collection.
 */
const subscriptionInvoiceSchema = new Schema(
  {
    planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    billingCycle: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 }, // smallest currency unit (paise)
    currency: { type: String, default: 'INR' },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    status: { type: String, enum: SUBSCRIPTION_INVOICE_STATUSES, default: 'pending', required: true },

    razorpay: {
      orderId: { type: String },
      paymentId: { type: String },
      signature: { type: String },
    },

    failureReason: { type: String, trim: true },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

subscriptionInvoiceSchema.plugin(tenantScopePlugin);

subscriptionInvoiceSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
subscriptionInvoiceSchema.index({ tenantId: 1, 'razorpay.orderId': 1 });

const SubscriptionInvoice = mongoose.model('SubscriptionInvoice', subscriptionInvoiceSchema);

module.exports = { SubscriptionInvoice, SUBSCRIPTION_INVOICE_STATUSES };
