const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const newsletterSubscriberSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

newsletterSubscriberSchema.plugin(tenantScopePlugin);

newsletterSubscriberSchema.index({ tenantId: 1, email: 1 }, { unique: true });

const NewsletterSubscriber = mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);

module.exports = { NewsletterSubscriber };
