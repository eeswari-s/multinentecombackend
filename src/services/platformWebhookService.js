const { SubscriptionInvoice } = require('../models/subscriptionInvoice.model');
const { verifyWebhookSignature } = require('../integrations/razorpay/signature');
const { markInvoicePaid, markInvoiceFailed } = require('./clientAdmin/subscriptionBillingService');
const { runAcrossAllTenants } = require('./superAdmin/crossTenantAccess');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Flow A webhook: the platform's own Razorpay account has ONE webhook
 * secret (env.razorpay.platformWebhookSecret) — unlike tenant webhooks,
 * there's no per-tenant secret lookup, since this is the SaaS owner's own
 * account being charged by tenants, not the other way around. The tenant
 * that owns the matching invoice is resolved from the invoice record
 * itself (found via the Super Admin cross-tenant bypass, since the
 * incoming webhook carries no tenant identifier).
 */
async function handlePlatformRazorpayWebhook({ rawBody, signatureHeader }) {
  const signatureValid = verifyWebhookSignature(rawBody, signatureHeader, env.razorpay.platformWebhookSecret);

  let payload = null;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    payload = null;
  }

  if (!signatureValid) {
    logger.warn('Platform Razorpay webhook signature verification failed', { eventType: payload?.event });
    return { signatureValid: false, processed: false };
  }

  const eventType = payload?.event;
  if (eventType !== 'payment.captured' && eventType !== 'payment.failed') {
    return { signatureValid: true, processed: true };
  }

  const razorpayOrderId = payload.payload.payment.entity.order_id;
  const razorpayPaymentId = payload.payload.payment.entity.id;

  try {
    await runAcrossAllTenants(async () => {
      const invoice = await SubscriptionInvoice.findOne({ 'razorpay.orderId': razorpayOrderId });
      if (!invoice || invoice.status === 'paid') return;

      if (eventType === 'payment.captured') {
        invoice.razorpay.paymentId = razorpayPaymentId;
        await markInvoicePaid(invoice, invoice.tenantId);
      } else {
        const failureReason =
          payload.payload.payment.entity.error_description || payload.payload.payment.entity.error_reason || 'Payment failed';
        await markInvoiceFailed(invoice, invoice.tenantId, failureReason);
      }
    });
    return { signatureValid: true, processed: true };
  } catch (err) {
    logger.error('Failed to process platform Razorpay webhook', { error: err.message, razorpayOrderId, eventType });
    return { signatureValid: true, processed: false };
  }
}

module.exports = { handlePlatformRazorpayWebhook };
