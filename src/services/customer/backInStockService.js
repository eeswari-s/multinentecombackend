const { BackInStockSubscription } = require('../../models/backInStockSubscription.model');
const { Product } = require('../../models/product.model');
const requestContext = require('../../utils/requestContext');
const { enqueueEmail } = require('../../jobs/queues/email.queue');
const ApiError = require('../../utils/ApiError');

async function subscribe({ customerId, productId, sku, email }) {
  const product = await Product.findById(productId).lean();
  if (!product) throw ApiError.notFound('Product not found');

  const variant = product.variants.find((v) => v.sku === sku);
  if (!variant) throw ApiError.notFound('Product variant not found');
  if (variant.stock > 0) throw ApiError.badRequest('This variant is already in stock');

  return BackInStockSubscription.findOneAndUpdate(
    { customerId, productId, variantSku: sku },
    { $set: { email } },
    { upsert: true, returnDocument: 'after' }
  );
}

async function unsubscribe({ customerId, productId, sku }) {
  await BackInStockSubscription.deleteOne({ customerId, productId, variantSku: sku });
}

async function listMySubscriptions(customerId) {
  return BackInStockSubscription.find({ customerId }).sort({ createdAt: -1 }).lean();
}

/**
 * Called from inventoryService.adjustStock whenever a variant's stock
 * crosses from 0 to positive — notifies every subscriber then clears their
 * subscriptions (a customer wanting future alerts for the same variant
 * simply subscribes again next time it's out of stock).
 */
async function notifySubscribers({ productId, sku, productName }) {
  const subscriptions = await BackInStockSubscription.find({ productId, variantSku: sku }).lean();
  if (subscriptions.length === 0) return;

  const tenantId = requestContext.getTenantId();
  for (const sub of subscriptions) {
    await enqueueEmail({
      tenantId,
      type: 'back_in_stock',
      to: sub.email,
      data: { productName },
    });
  }

  await BackInStockSubscription.deleteMany({ productId, variantSku: sku });
}

module.exports = { subscribe, unsubscribe, listMySubscriptions, notifySubscribers };
