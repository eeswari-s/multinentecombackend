const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const backInStockSubscriptionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantSku: { type: String, required: true, trim: true, uppercase: true },
    email: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

backInStockSubscriptionSchema.plugin(tenantScopePlugin);

backInStockSubscriptionSchema.index({ tenantId: 1, customerId: 1, productId: 1, variantSku: 1 }, { unique: true });
backInStockSubscriptionSchema.index({ tenantId: 1, productId: 1, variantSku: 1 });

const BackInStockSubscription = mongoose.model('BackInStockSubscription', backInStockSubscriptionSchema);

module.exports = { BackInStockSubscription };
