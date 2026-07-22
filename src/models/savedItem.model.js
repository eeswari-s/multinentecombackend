const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

/**
 * "Save for later" — items moved out of the active cart, re-addable at any
 * time. Kept as its own small collection rather than a flag on cart items
 * so listing/re-adding never has to distinguish cart-item shape from
 * saved-item shape.
 */
const savedItemSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantSku: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true },
    image: { type: String },
  },
  { timestamps: true }
);

savedItemSchema.plugin(tenantScopePlugin);

savedItemSchema.index({ tenantId: 1, customerId: 1, productId: 1, variantSku: 1 }, { unique: true });

const SavedItem = mongoose.model('SavedItem', savedItemSchema);

module.exports = { SavedItem };
