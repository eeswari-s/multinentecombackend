const { Product } = require('../../models/product.model');
const { Inventory } = require('../../models/inventory.model');
const backInStockService = require('../customer/backInStockService');
const ApiError = require('../../utils/ApiError');

/**
 * Atomically mutates a variant's on-hand stock and records the movement.
 * For decrements, the guard `'variants.$.stock': { $gte: -quantityChange }`
 * is baked into the same findOneAndUpdate the increment runs in, so two
 * concurrent decrements (e.g. two near-simultaneous order placements)
 * cannot both succeed and drive stock negative — MongoDB evaluates the
 * filter and the $inc as a single atomic document operation.
 */
async function adjustStock({ productId, sku, quantityChange, type, reason, performedBy, relatedOrderId = null }) {
  if (quantityChange === 0) {
    throw ApiError.badRequest('quantityChange must be non-zero');
  }

  const filter = { _id: productId, 'variants.sku': sku };
  if (quantityChange < 0) {
    filter['variants.stock'] = { $gte: -quantityChange };
  }

  const updated = await Product.findOneAndUpdate(
    filter,
    { $inc: { 'variants.$.stock': quantityChange } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    const exists = await Product.exists({ _id: productId, 'variants.sku': sku });
    if (!exists) throw ApiError.notFound('Product/variant not found');
    throw ApiError.badRequest('Insufficient stock for this operation');
  }

  // findOneAndUpdate's raw $inc bypasses Mongoose's pre('validate') hook
  // (product.model.js's recomputeDenormalizedFields), which is the only
  // place totalStock normally gets recalculated — left alone, every stock
  // adjustment through this, the primary way stock ever changes, would
  // leave totalStock permanently stale from the moment the product was
  // first created.
  const totalStock = updated.variants.reduce((sum, v) => sum + v.stock, 0);
  await Product.updateOne({ _id: updated._id }, { $set: { totalStock } });

  const variant = updated.variants.find((v) => v.sku === sku);
  const previousStock = variant.stock - quantityChange;

  await Inventory.create({
    productId,
    sku,
    type,
    quantityChange,
    resultingStock: variant.stock,
    reason,
    performedBy,
    relatedOrderId,
  });

  if (previousStock <= 0 && variant.stock > 0) {
    await backInStockService.notifySubscribers({ productId, sku, productName: updated.name });
  }

  return variant.stock;
}

async function getMovements({ productId, sku, page = 1, limit = 20 }) {
  const filter = {};
  if (productId) filter.productId = productId;
  if (sku) filter.sku = sku;

  const [items, total] = await Promise.all([
    Inventory.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Inventory.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

module.exports = { adjustStock, getMovements };
