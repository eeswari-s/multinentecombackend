const { Tenant } = require('../../models/tenant.model');
const { User } = require('../../models/user.model');
const { SubscriptionPlan } = require('../../models/subscriptionPlan.model');
const { SubscriptionInvoice } = require('../../models/subscriptionInvoice.model');
const { getPlatformRazorpayClient } = require('../../integrations/razorpay/platformClient');
const { verifyPaymentSignature } = require('../../integrations/razorpay/signature');
const { addBillingCycle } = require('../../utils/billingCycle');
const tenantService = require('../tenantService');
const { recordAuditLog } = require('../superAdmin/auditLogService');
const platformNotificationService = require('../superAdmin/platformNotificationService');
const { enqueueEmail } = require('../../jobs/queues/email.queue');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');

async function getCurrentSubscription(tenantId) {
  const tenant = await Tenant.findById(tenantId).populate('subscription.planId').lean();
  if (!tenant) throw ApiError.notFound('Tenant not found');
  return tenant.subscription;
}

/**
 * Creates a Razorpay order in the PLATFORM's own account (Flow A) to charge
 * this tenant for a subscription period, and a matching pending invoice.
 * `billingCycle` may switch the tenant to a different cycle than they're
 * currently on (this also covers upgrade/downgrade — the plan itself is
 * changed via Super Admin's assignPlan; this just bills for whatever plan
 * is currently assigned).
 */
async function initiateSubscriptionPayment({ tenantId, billingCycle }) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw ApiError.notFound('Tenant not found');
  if (!tenant.subscription.planId) {
    throw ApiError.badRequest('No subscription plan is assigned to this store yet');
  }

  const plan = await SubscriptionPlan.findById(tenant.subscription.planId);
  if (!plan || !plan.isActive) throw ApiError.badRequest('Assigned plan is not available');
  if (!plan.pricing.has(billingCycle)) {
    throw ApiError.badRequest(`This plan has no pricing for the "${billingCycle}" billing cycle`);
  }

  const amount = plan.pricing.get(billingCycle);
  const periodStart = new Date();
  const periodEnd = addBillingCycle(periodStart, billingCycle);

  const client = getPlatformRazorpayClient();
  const razorpayOrder = await client.orders.create({
    amount,
    currency: 'INR',
    receipt: `sub_${tenantId}_${Date.now()}`,
  });

  const invoice = await SubscriptionInvoice.create({
    planId: plan._id,
    billingCycle,
    amount,
    currency: 'INR',
    periodStart,
    periodEnd,
    status: 'pending',
    razorpay: { orderId: razorpayOrder.id },
  });

  return {
    invoiceId: invoice._id,
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    razorpayKeyId: env.razorpay.platformKeyId,
  };
}

async function markInvoicePaid(invoice, tenantId) {
  invoice.status = 'paid';
  invoice.paidAt = new Date();
  await invoice.save();

  const tenant = await Tenant.findById(tenantId);
  tenant.subscription.status = 'active';
  tenant.subscription.billingCycle = invoice.billingCycle;
  tenant.subscription.currentPeriodStart = invoice.periodStart;
  tenant.subscription.currentPeriodEnd = invoice.periodEnd;
  await tenant.save();

  await tenantService.invalidateTenantCache(tenant);
  return invoice;
}

/**
 * Marks a platform (Flow A) subscription invoice as failed and notifies the
 * tenant owner — this is the counterpart to markInvoicePaid that was
 * previously entirely missing: SubscriptionInvoice's schema has supported a
 * 'failed' status since Phase 7, but nothing ever set it, so failed
 * payments were silently invisible to both the tenant and Super Admin.
 */
async function markInvoiceFailed(invoice, tenantId, failureReason) {
  invoice.status = 'failed';
  invoice.failureReason = failureReason;
  await invoice.save();

  await recordAuditLog({
    action: 'subscription.payment_failed',
    tenantId,
    metadata: { invoiceId: invoice._id, amount: invoice.amount, failureReason },
  });

  const [owner, plan, tenant] = await Promise.all([
    User.findOne({ tenantId, role: 'owner' }).lean(),
    SubscriptionPlan.findById(invoice.planId).lean(),
    Tenant.findById(tenantId).select('businessName').lean(),
  ]);
  if (owner) {
    await enqueueEmail({
      tenantId: null, // platform-to-tenant billing correspondence, sent via the platform's own Brevo identity
      type: 'subscription_payment_failed',
      to: owner.email,
      data: { storeName: tenant?.businessName, planName: plan?.name, failureReason },
    });
  }

  await platformNotificationService.notify({
    type: 'subscription_payment_failed',
    title: 'Subscription payment failed',
    message: `Payment failed for ${tenant?.businessName || 'a tenant'}: ${failureReason}`,
    tenantId,
  });

  return invoice;
}

async function verifySubscriptionPayment({ tenantId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const invoice = await SubscriptionInvoice.findOne({ 'razorpay.orderId': razorpayOrderId });
  if (!invoice) throw ApiError.notFound('Subscription invoice not found');
  if (invoice.status === 'paid') return invoice;

  const valid = verifyPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
    keySecret: env.razorpay.platformKeySecret,
  });
  if (!valid) throw ApiError.unauthorized('Payment signature verification failed');

  invoice.razorpay.paymentId = razorpayPaymentId;
  invoice.razorpay.signature = razorpaySignature;

  return markInvoicePaid(invoice, tenantId);
}

async function listInvoices({ page = 1, limit = 20, status }) {
  const filter = status ? { status } : {};
  const [items, total] = await Promise.all([
    SubscriptionInvoice.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SubscriptionInvoice.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

module.exports = {
  getCurrentSubscription,
  initiateSubscriptionPayment,
  verifySubscriptionPayment,
  markInvoicePaid,
  markInvoiceFailed,
  listInvoices,
};
