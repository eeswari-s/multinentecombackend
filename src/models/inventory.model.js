const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const MOVEMENT_TYPES = ['restock', 'sale', 'return', 'adjustment', 'damage'];

/**
 * Append-only stock movement ledger. product.variants[].stock is the
 * current on-hand quantity (the fast-read value used at checkout);
 * every change to it is also recorded here so Client Admin can audit
 * "why is stock at this number" and Super Admin/analytics can build
 * inventory reports without replaying order history.
 */
const inventorySchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    quantityChange: { type: Number, required: true }, // signed: +restock, -sale
    resultingStock: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    relatedOrderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  },
  { timestamps: true }
);

inventorySchema.plugin(tenantScopePlugin);

inventorySchema.index({ tenantId: 1, productId: 1, createdAt: -1 });
inventorySchema.index({ tenantId: 1, sku: 1, createdAt: -1 });

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = { Inventory, MOVEMENT_TYPES };
