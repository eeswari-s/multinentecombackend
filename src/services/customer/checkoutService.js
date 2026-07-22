const { Order } = require('../../models/order.model');
const { Product } = require('../../models/product.model');
const { Customer } = require('../../models/customer.model');
const { Coupon } = require('../../models/coupon.model');
const { RazorpayConfig } = require('../../models/razorpayConfig.model');
const inventoryService = require('../clientAdmin/inventoryService');
const counterService = require('../counterService');
const quotaService = require('../clientAdmin/quotaService');
const cartService = require('./cartService');
const { getTenantRazorpayClient } = require('../../integrations/razorpay/tenantClient');
const { verifyPaymentSignature } = require('../../integrations/razorpay/signature');
const { decrypt } = require('../../utils/encryption');
const { enqueueEmail } = require('../../jobs/queues/email.queue');
const requestContext = require('../../utils/requestContext');
const ApiError = require('../../utils/ApiError');

/**
 * A tenant whose subscription grace period has fully lapsed ('expired')
 * goes read-only: browsing and the admin panel keep working, but new
 * orders are blocked here at the single choke point every checkout path
 * (COD and Razorpay) already passes through.
 */
function assertStoreAcceptingOrders() {
  const tenant = requestContext.getTenant();
  if (tenant?.subscription?.status === 'expired') {
    throw ApiError.forbidden('This store is not currently accepting new orders. Please try again later.');
  }
}

async function setShippingAddress({ customerId, shippingAddress }) {
  const cart = await Order.findOne({ customerId, status: 'cart' });
  if (!cart || cart.items.length === 0) throw ApiError.badRequest('Cart is empty');

  cart.shippingAddress = shippingAddress;
  // Recomputed now, not just at checkout — the GST split (CGST+SGST vs
  // IGST) depends on the buyer's state, which is only known from here on.
  await cartService.recomputePricing(cart);
  await cart.save();
  return cart;
}

async function assertStockStillAvailable(items) {
  for (const item of items) {
    const product = await Product.findById(item.productId);
    const variant = product?.variants.find((v) => v.sku === item.variantSku);
    if (!variant || variant.stock < item.quantity) {
      throw ApiError.badRequest(`"${item.name}" no longer has enough stock`);
    }
  }
}

/**
 * Confirms an order: decrements stock, assigns the sequential invoice/order
 * numbers, and marks it confirmed. Idempotent — safe to call twice for the
 * same order (e.g. once from the payment-verify callback and again from
 * the webhook) without double-decrementing stock or re-issuing numbers.
 */
async function confirmOrder(order) {
  if (order.status === 'confirmed') return order;

  for (const item of order.items) {
    await inventoryService.adjustStock({
      productId: item.productId,
      sku: item.variantSku,
      quantityChange: -item.quantity,
      type: 'sale',
      reason: `Order ${order._id}`,
      relatedOrderId: order._id,
    });
  }

  const tenant = requestContext.getTenant();
  const invoiceSeq = await counterService.getNextSequence('invoice');
  order.invoiceNumber = `${tenant?.invoicePrefix || 'INV'}-${String(invoiceSeq).padStart(6, '0')}`;

  const orderSeq = await counterService.getNextSequence('order');
  order.orderNumber = `ORD-${String(orderSeq).padStart(6, '0')}`;

  order.status = 'confirmed';
  order.confirmedAt = new Date();
  if (order.paymentMethod === 'cod') order.paymentStatus = 'pending';

  await order.save();

  if (order.couponCode) {
    await Coupon.updateOne({ code: order.couponCode }, { $inc: { usageCount: 1 } });
  }

  const customer = await Customer.findById(order.customerId).lean();
  if (customer) {
    await enqueueEmail({
      tenantId: order.tenantId,
      type: 'order_confirmation',
      to: customer.email,
      data: {
        orderNumber: order.orderNumber,
        items: order.items,
        grandTotal: order.pricing.grandTotal,
        customerName: customer.name,
      },
    });
  }

  return order;
}

async function initiateCheckout({ customerId, paymentMethod }) {
  const cart = await Order.findOne({ customerId, status: 'cart' });
  if (!cart || cart.items.length === 0) throw ApiError.badRequest('Cart is empty');
  if (!cart.shippingAddress?.line1) {
    throw ApiError.badRequest('Shipping address is required before checkout');
  }

  assertStoreAcceptingOrders();

  // Checked before any payment is initiated (COD confirms immediately;
  // Razorpay would otherwise capture money before the tenant's monthly
  // order quota gets a say) — a quota block must never happen after the
  // customer has already paid.
  await quotaService.assertOrderQuota();
  await assertStockStillAvailable(cart.items);

  cart.paymentMethod = paymentMethod;
  cart.placedAt = new Date();

  if (paymentMethod === 'cod') {
    await confirmOrder(cart);
    return { order: cart };
  }

  // Flow B: the Razorpay order is created directly inside THIS tenant's own
  // Razorpay account — the platform never becomes custodian of the money.
  const client = await getTenantRazorpayClient();
  const razorpayOrder = await client.orders.create({
    amount: Math.round(cart.pricing.grandTotal * 100),
    currency: 'INR',
    receipt: String(cart._id),
  });

  cart.status = 'pending_payment';
  cart.razorpay = { orderId: razorpayOrder.id };
  await cart.save();

  return { order: cart, razorpayOrderId: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency };
}

async function verifyPayment({ customerId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const order = await Order.findOne({ customerId, 'razorpay.orderId': razorpayOrderId });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status === 'confirmed') return order; // already confirmed, e.g. by the webhook

  const config = await RazorpayConfig.findOne({ isActive: true });
  if (!config) throw ApiError.badRequest('Razorpay is not configured for this store');

  const valid = verifyPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
    keySecret: decrypt(config.encryptedKeySecret),
  });
  if (!valid) throw ApiError.unauthorized('Payment signature verification failed');

  order.razorpay.paymentId = razorpayPaymentId;
  order.razorpay.signature = razorpaySignature;
  order.paymentStatus = 'paid';

  return confirmOrder(order);
}

module.exports = { setShippingAddress, initiateCheckout, verifyPayment, confirmOrder };
