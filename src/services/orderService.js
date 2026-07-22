const { Order } = require('../models/order.model');
const { Customer } = require('../models/customer.model');
const inventoryService = require('./clientAdmin/inventoryService');
const { recordActivityLog } = require('./clientAdmin/activityLogService');
const loyaltyService = require('./customer/loyaltyService');
const { getTenantRazorpayClient } = require('../integrations/razorpay/tenantClient');
const { enqueueEmail } = require('../jobs/queues/email.queue');
const ApiError = require('../utils/ApiError');

const REFUNDABLE_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];

const SHIPPING_UPDATE_STATUSES = ['shipped', 'delivered'];

const CUSTOMER_CANCELLABLE_STATUSES = ['confirmed', 'processing'];

const ADMIN_STATUS_TRANSITIONS = {
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
};

async function restockOrderItems(order, performedBy) {
  for (const item of order.items) {
    await inventoryService.adjustStock({
      productId: item.productId,
      sku: item.variantSku,
      quantityChange: item.quantity,
      type: 'return',
      reason: `Order ${order._id} cancelled/returned`,
      performedBy,
      relatedOrderId: order._id,
    });
  }
}

async function listCustomerOrders(customerId, { page = 1, limit = 20 }) {
  const filter = { customerId, status: { $ne: 'cart' } };
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

async function getCustomerOrder(customerId, orderId) {
  const order = await Order.findOne({ _id: orderId, customerId, status: { $ne: 'cart' } }).lean();
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

async function cancelCustomerOrder({ customerId, orderId, reason }) {
  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order || order.status === 'cart') throw ApiError.notFound('Order not found');
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
    throw ApiError.badRequest(`Order cannot be cancelled from status "${order.status}"`);
  }

  await restockOrderItems(order, null);
  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancelReason = reason;
  await order.save();
  return order;
}

async function listOrdersForAdmin({ page = 1, limit = 20, status }) {
  const filter = status ? { status } : { status: { $ne: 'cart' } };
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

async function getOrderForAdmin(orderId) {
  const order = await Order.findOne({ _id: orderId, status: { $ne: 'cart' } }).lean();
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

async function updateOrderStatus({ orderId, status, actor }) {
  const order = await Order.findOne({ _id: orderId, status: { $ne: 'cart' } });
  if (!order) throw ApiError.notFound('Order not found');

  const allowed = ADMIN_STATUS_TRANSITIONS[order.status] || [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Cannot transition order from "${order.status}" to "${status}"`);
  }

  if (status === 'cancelled' || status === 'returned') {
    await restockOrderItems(order, actor.userId);
  }

  order.status = status;
  if (status === 'cancelled') order.cancelledAt = new Date();
  await order.save();

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'order.status_changed',
    targetType: 'Order',
    targetId: order._id,
    metadata: { status },
  });

  if (SHIPPING_UPDATE_STATUSES.includes(status)) {
    const customer = await Customer.findById(order.customerId).lean();
    if (customer) {
      await enqueueEmail({
        tenantId: order.tenantId,
        type: 'shipping_update',
        to: customer.email,
        data: { orderNumber: order.orderNumber, status },
      });
    }
  }

  if (status === 'delivered') {
    await loyaltyService.rewardReferrerOnFirstDelivery({ customerId: order.customerId });
  }

  return order;
}

/**
 * Issues a refund against the order's ORIGINAL payment — through the
 * tenant's own Razorpay account (Flow B), same as the original charge, so
 * the money moves directly between the tenant's account and the customer,
 * never through the platform. COD orders have no online payment to refund
 * through a gateway, so a COD "refund" is just a bookkeeping record for
 * whatever offline reimbursement the tenant already handled.
 */
async function refundOrder({ orderId, amount, reason, actor }) {
  const order = await Order.findOne({ _id: orderId, status: { $ne: 'cart' } });
  if (!order) throw ApiError.notFound('Order not found');
  if (!REFUNDABLE_STATUSES.includes(order.status)) {
    throw ApiError.badRequest(`Cannot refund an order in status "${order.status}"`);
  }
  if (order.refund?.razorpayRefundId || order.paymentStatus === 'refunded') {
    throw ApiError.conflict('This order has already been refunded');
  }

  const refundAmount = amount ?? order.pricing.grandTotal;
  if (refundAmount > order.pricing.grandTotal) {
    throw ApiError.badRequest('Refund amount cannot exceed the order total');
  }

  let razorpayRefundId = null;
  if (order.paymentMethod === 'razorpay') {
    if (!order.razorpay?.paymentId) throw ApiError.badRequest('This order has no captured payment to refund');
    const client = await getTenantRazorpayClient();
    const refund = await client.payments.refund(order.razorpay.paymentId, {
      amount: Math.round(refundAmount * 100),
    });
    razorpayRefundId = refund.id;
  }

  order.refund = { razorpayRefundId, amount: refundAmount, reason, refundedAt: new Date() };
  order.paymentStatus = 'refunded';
  await order.save();

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'order.refunded',
    targetType: 'Order',
    targetId: order._id,
    metadata: { amount: refundAmount, reason, razorpayRefundId },
  });

  return order;
}

module.exports = {
  listCustomerOrders,
  getCustomerOrder,
  cancelCustomerOrder,
  listOrdersForAdmin,
  getOrderForAdmin,
  updateOrderStatus,
  refundOrder,
};
