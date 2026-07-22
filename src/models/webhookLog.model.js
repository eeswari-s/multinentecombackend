const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

/**
 * Records every inbound Razorpay webhook attempt for this tenant — including
 * failed signature verifications — for reconciliation. `dedupeKey` is what
 * makes processing idempotent: Razorpay retries webhooks, so the same
 * event id arriving twice must not double-fulfill an order.
 */
const webhookLogSchema = new Schema(
  {
    provider: { type: String, enum: ['razorpay'], default: 'razorpay' },
    eventType: { type: String, trim: true },
    dedupeKey: { type: String, required: true, trim: true },
    signatureValid: { type: Boolean, required: true },
    processed: { type: Boolean, default: false },
    payload: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true }
);

webhookLogSchema.plugin(tenantScopePlugin);

webhookLogSchema.index({ tenantId: 1, dedupeKey: 1 }, { unique: true });

const WebhookLog = mongoose.model('WebhookLog', webhookLogSchema);

module.exports = { WebhookLog };
