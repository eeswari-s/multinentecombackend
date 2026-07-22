const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

/**
 * One document per tenant, holding THAT tenant's own Brevo credentials for
 * transactional email (sender name/email are not secret and stored in the
 * clear; the API key is encrypted at rest, same pattern as
 * razorpayConfig.model.js).
 */
const brevoConfigSchema = new Schema(
  {
    encryptedApiKey: { type: String, required: true },
    apiKeyPreview: { type: String, required: true },
    senderName: { type: String, required: true, trim: true },
    senderEmail: { type: String, required: true, lowercase: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

brevoConfigSchema.plugin(tenantScopePlugin, { skipDefaultIndex: true });

brevoConfigSchema.index({ tenantId: 1 }, { unique: true });

brevoConfigSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.encryptedApiKey;
    delete ret.__v;
    return ret;
  },
});

const BrevoConfig = mongoose.model('BrevoConfig', brevoConfigSchema);

module.exports = { BrevoConfig };
