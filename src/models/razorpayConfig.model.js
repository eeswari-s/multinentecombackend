const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

/**
 * One document per tenant, holding THAT tenant's own Razorpay credentials
 * for storefront checkout (Flow B) — never the platform account (Flow A,
 * which lives only in env.js). Key id/secret/webhook secret are all
 * encrypted at rest (AES-256-GCM, see utils/encryption.js) and decrypted
 * only at the moment of use inside paymentService. `keyIdPreview` is a
 * masked, non-sensitive value precomputed at write time so GET endpoints
 * never need to decrypt anything just to render the settings page.
 */
const razorpayConfigSchema = new Schema(
  {
    encryptedKeyId: { type: String, required: true },
    encryptedKeySecret: { type: String, required: true },
    encryptedWebhookSecret: { type: String, required: true },
    keyIdPreview: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

razorpayConfigSchema.plugin(tenantScopePlugin, { skipDefaultIndex: true });

razorpayConfigSchema.index({ tenantId: 1 }, { unique: true });

razorpayConfigSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.encryptedKeyId;
    delete ret.encryptedKeySecret;
    delete ret.encryptedWebhookSecret;
    delete ret.__v;
    return ret;
  },
});

const RazorpayConfig = mongoose.model('RazorpayConfig', razorpayConfigSchema);

module.exports = { RazorpayConfig };
