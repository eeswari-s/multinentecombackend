const { WebhookLog } = require('../models/webhookLog.model');
const { Order } = require('../models/order.model');
const { getTenantWebhookSecret } = require('../integrations/razorpay/tenantClient');
const { verifyWebhookSignature } = require('../integrations/razorpay/signature');
const checkoutService = require('./customer/checkoutService');
const logger = require('../utils/logger');

function extractEventIdentity(payload) {
  const eventType = payload?.event || 'unknown';
  const entityId =
    payload?.payload?.payment?.entity?.id || payload?.payload?.order?.entity?.id || 'no-entity-id';
  return { eventType, dedupeKey: `${eventType}:${entityId}` };
}

/**
 * Every Razorpay webhook for a tenant is verified using THAT tenant's own
 * webhook secret (never a global one), logged even when verification
 * fails, and processed idempotently — Razorpay retries webhooks, so the
 * same event arriving twice must not double-confirm an order or
 * double-decrement stock (confirmOrder itself is also idempotent as a
 * second line of defense).
 */
async function handleRazorpayWebhook({ rawBody, signatureHeader }) {
  const secret = await getTenantWebhookSecret();
  const signatureValid = Boolean(secret) && verifyWebhookSignature(rawBody, signatureHeader, secret);

  let payload = null;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    payload = null;
  }

  if (!signatureValid) {
    const { eventType } = extractEventIdentity(payload);
    await WebhookLog.create({
      eventType,
      dedupeKey: `invalid:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      signatureValid: false,
      processed: false,
      payload,
      error: 'Signature verification failed',
    });
    return { signatureValid: false, processed: false, alreadyProcessed: false };
  }

  const { eventType, dedupeKey } = extractEventIdentity(payload);

  const existing = await WebhookLog.findOne({ dedupeKey });
  if (existing?.processed) {
    return { signatureValid: true, processed: true, alreadyProcessed: true };
  }

  let processed = false;
  let error = null;
  try {
    if (eventType === 'payment.captured') {
      const razorpayOrderId = payload.payload.payment.entity.order_id;
      const razorpayPaymentId = payload.payload.payment.entity.id;

      const order = await Order.findOne({ 'razorpay.orderId': razorpayOrderId });
      if (order && order.status !== 'confirmed') {
        order.razorpay.paymentId = razorpayPaymentId;
        order.paymentStatus = 'paid';
        await checkoutService.confirmOrder(order);
      }
    }
    processed = true;
  } catch (err) {
    error = err.message;
    logger.error('Failed to process Razorpay webhook', { eventType, error: err.message });
  }

  if (existing) {
    existing.processed = processed;
    existing.error = error;
    existing.payload = payload;
    await existing.save();
  } else {
    await WebhookLog.create({ eventType, dedupeKey, signatureValid: true, processed, payload, error });
  }

  return { signatureValid: true, processed, alreadyProcessed: false };
}

module.exports = { handleRazorpayWebhook };
