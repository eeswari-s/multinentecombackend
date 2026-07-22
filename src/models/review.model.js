const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

const reviewSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: REVIEW_STATUSES, default: 'pending', required: true },
    adminReply: { type: String, trim: true, maxlength: 2000, default: null },
  },
  { timestamps: true }
);

reviewSchema.plugin(tenantScopePlugin);

reviewSchema.index({ tenantId: 1, productId: 1, status: 1 });
reviewSchema.index({ tenantId: 1, customerId: 1, productId: 1, orderId: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);

module.exports = { Review, REVIEW_STATUSES };
