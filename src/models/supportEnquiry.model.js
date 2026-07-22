const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const ENQUIRY_TYPES = ['general', 'product', 'bulk_order'];
const ENQUIRY_STATUSES = ['open', 'resolved'];

const supportEnquirySchema = new Schema(
  {
    type: { type: String, enum: ENQUIRY_TYPES, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    subject: { type: String, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },

    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null }, // for type: 'product'
    quantity: { type: Number, min: 1, default: null }, // for type: 'bulk_order'

    status: { type: String, enum: ENQUIRY_STATUSES, default: 'open' },
    adminReply: { type: String, trim: true, maxlength: 5000 },
  },
  { timestamps: true }
);

supportEnquirySchema.plugin(tenantScopePlugin);

supportEnquirySchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const SupportEnquiry = mongoose.model('SupportEnquiry', supportEnquirySchema);

module.exports = { SupportEnquiry, ENQUIRY_TYPES, ENQUIRY_STATUSES };
