const { Order } = require('../../models/order.model');
const { Product } = require('../../models/product.model');
const { SavedItem } = require('../../models/savedItem.model');
const requestContext = require('../../utils/requestContext');
const { validateCoupon, calculateDiscount } = require('./couponApplicationService');
const { calculateCartLevelOfferDiscount } = require('./offerApplicationService');
const ApiError = require('../../utils/ApiError');

const DEFAULT_SHIPPING = { flatRate: 49, freeShippingThreshold: 999 };

function round2(value) {
  return Math.round(value * 100) / 100;
}

function getShippingSettings() {
  const tenant = requestContext.getTenant();
  return tenant?.shippingSettings || DEFAULT_SHIPPING;
}

/**
 * Indian GST: a sale within the same state as the seller is split evenly
 * into CGST + SGST (both go to different government accounts); a sale
 * across state lines is charged as a single IGST instead. Which applies
 * depends on the BUYER's state, only known once shippingAddress is set —
 * before that, the split fields stay 0 even though gstAmount (the total)
 * is already known from the items alone.
 */
function splitGst(totalGstAmount, order) {
  const sellerState = requestContext.getTenant()?.address?.state;
  const buyerState = order.shippingAddress?.state;

  if (!sellerState || !buyerState) {
    return { cgstAmount: 0, sgstAmount: 0, igstAmount: 0 };
  }

  const isIntraState = sellerState.trim().toLowerCase() === buyerState.trim().toLowerCase();
  if (isIntraState) {
    const half = round2(totalGstAmount / 2);
    return { cgstAmount: half, sgstAmount: half, igstAmount: 0 };
  }
  return { cgstAmount: 0, sgstAmount: 0, igstAmount: round2(totalGstAmount) };
}

/**
 * Re-derives pricing from scratch on every cart mutation, including
 * re-validating any applied coupon — if the cart no longer meets the
 * coupon's minimum order value (e.g. after removing an item), the coupon
 * is silently dropped rather than left applied against a stale total.
 */
async function recomputePricing(order) {
  const itemsTotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);
  const gstAmount = order.items.reduce((sum, item) => sum + (item.subtotal * item.gstRate) / 100, 0);

  const { flatRate, freeShippingThreshold } = getShippingSettings();
  const shippingCharge = order.items.length === 0 || itemsTotal >= freeShippingThreshold ? 0 : flatRate;

  let discountAmount = await calculateCartLevelOfferDiscount(order.items);

  if (order.couponCode) {
    try {
      const coupon = await validateCoupon({ code: order.couponCode, customerId: order.customerId, itemsTotal });
      discountAmount += calculateDiscount(coupon, itemsTotal - discountAmount);
    } catch {
      order.couponCode = null;
    }
  }

  const { cgstAmount, sgstAmount, igstAmount } = splitGst(gstAmount, order);

  order.pricing = {
    itemsTotal: round2(itemsTotal),
    shippingCharge: round2(shippingCharge),
    gstAmount: round2(gstAmount),
    cgstAmount,
    sgstAmount,
    igstAmount,
    discountAmount: round2(discountAmount),
    grandTotal: round2(itemsTotal + gstAmount + shippingCharge - discountAmount),
  };
}

async function getOrCreateCart(customerId) {
  let cart = await Order.findOne({ customerId, status: 'cart' });
  if (!cart) {
    cart = await Order.create({ customerId, status: 'cart', items: [] });
  }
  return cart;
}

async function findVariant(productId, sku) {
  const product = await Product.findOne({ _id: productId, status: 'published' });
  if (!product) throw ApiError.notFound('Product not found');

  const variant = product.variants.find((v) => v.sku === sku && v.isActive);
  if (!variant) throw ApiError.notFound('Product variant not found');

  return { product, variant };
}

async function addItem({ customerId, productId, sku, quantity }) {
  const { product, variant } = await findVariant(productId, sku);
  if (variant.stock < quantity) {
    throw ApiError.badRequest('Not enough stock available for this item');
  }

  const cart = await getOrCreateCart(customerId);
  const unitPrice = variant.offerPrice != null ? variant.offerPrice : variant.price;

  const existing = cart.items.find((item) => item.productId.toString() === productId && item.variantSku === sku);
  if (existing) {
    existing.quantity += quantity;
    existing.subtotal = round2(existing.quantity * existing.unitPrice);
  } else {
    cart.items.push({
      productId: product._id,
      variantSku: sku,
      name: product.name,
      attributes: variant.attributes,
      image: product.images[0]?.url,
      unitPrice,
      gstRate: product.gst?.rate || 0,
      quantity,
      subtotal: round2(unitPrice * quantity),
    });
  }

  await recomputePricing(cart);
  await cart.save();
  return cart;
}

async function updateItemQuantity({ customerId, itemId, quantity }) {
  const cart = await getOrCreateCart(customerId);
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('Cart item not found');

  if (quantity <= 0) {
    item.deleteOne();
  } else {
    const { variant } = await findVariant(item.productId, item.variantSku);
    if (variant.stock < quantity) throw ApiError.badRequest('Not enough stock available for this item');
    item.quantity = quantity;
    item.subtotal = round2(item.unitPrice * quantity);
  }

  await recomputePricing(cart);
  await cart.save();
  return cart;
}

async function removeItem({ customerId, itemId }) {
  const cart = await getOrCreateCart(customerId);
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('Cart item not found');

  item.deleteOne();
  await recomputePricing(cart);
  await cart.save();
  return cart;
}

async function applyCoupon({ customerId, code }) {
  const cart = await getOrCreateCart(customerId);
  if (cart.items.length === 0) throw ApiError.badRequest('Cart is empty');

  await validateCoupon({ code, customerId, itemsTotal: cart.pricing.itemsTotal });

  cart.couponCode = code.toUpperCase();
  await recomputePricing(cart);
  if (!cart.couponCode) throw ApiError.badRequest('This coupon could not be applied to your cart');

  await cart.save();
  return cart;
}

async function removeCoupon({ customerId }) {
  const cart = await getOrCreateCart(customerId);
  cart.couponCode = null;
  await recomputePricing(cart);
  await cart.save();
  return cart;
}

/**
 * Recomputes pricing on every read, not just on mutation — otherwise a
 * shipping-settings change, an expired coupon, or an offer ending wouldn't
 * be reflected until the customer next touched the cart, showing stale
 * (potentially more favorable than valid) pricing in the meantime.
 */
async function getCart(customerId) {
  const cart = await getOrCreateCart(customerId);
  await recomputePricing(cart);
  await cart.save();
  return cart;
}

/** Moves a cart item out to the saved-for-later list. */
async function saveForLater({ customerId, itemId }) {
  const cart = await getOrCreateCart(customerId);
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('Cart item not found');

  await SavedItem.findOneAndUpdate(
    { customerId, productId: item.productId, variantSku: item.variantSku },
    { $set: { name: item.name, image: item.image } },
    { upsert: true }
  );

  item.deleteOne();
  await recomputePricing(cart);
  await cart.save();
  return cart;
}

async function listSavedItems(customerId) {
  return SavedItem.find({ customerId }).sort({ createdAt: -1 }).lean();
}

/** Moves a saved-for-later item back into the active cart, at current price/stock. */
async function moveToCart({ customerId, savedItemId, quantity = 1 }) {
  const savedItem = await SavedItem.findOne({ _id: savedItemId, customerId });
  if (!savedItem) throw ApiError.notFound('Saved item not found');

  const cart = await addItem({
    customerId,
    productId: savedItem.productId,
    sku: savedItem.variantSku,
    quantity,
  });

  await SavedItem.deleteOne({ _id: savedItemId });
  return cart;
}

async function removeSavedItem({ customerId, savedItemId }) {
  await SavedItem.deleteOne({ _id: savedItemId, customerId });
}

/**
 * "Buy again": re-adds every item from a past order into the active cart,
 * at CURRENT price/stock (never the historical order price) — skipping
 * items that are no longer available rather than failing the whole
 * request, and reporting back what was skipped so the frontend can inform
 * the customer why their cart doesn't have everything from that order.
 */
async function buyAgain({ customerId, orderId }) {
  const order = await Order.findOne({ _id: orderId, customerId, status: { $ne: 'cart' } }).lean();
  if (!order) throw ApiError.notFound('Order not found');

  const skipped = [];
  for (const item of order.items) {
    try {
      await addItem({ customerId, productId: item.productId, sku: item.variantSku, quantity: item.quantity });
    } catch (err) {
      skipped.push({ productId: item.productId, name: item.name, reason: err.message });
    }
  }

  const cart = await getCart(customerId);
  return { cart, skipped };
}

module.exports = {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
  applyCoupon,
  removeCoupon,
  recomputePricing,
  round2,
  saveForLater,
  listSavedItems,
  moveToCart,
  removeSavedItem,
  buyAgain,
};
