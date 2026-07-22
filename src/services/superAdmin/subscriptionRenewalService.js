const { Tenant } = require('../../models/tenant.model');
const { User } = require('../../models/user.model');
const tenantService = require('../tenantService');
const { recordAuditLog } = require('./auditLogService');
const platformNotificationService = require('./platformNotificationService');
const platformSettingsService = require('./platformSettingsService');
const { enqueueEmail } = require('../../jobs/queues/email.queue');
const logger = require('../../utils/logger');

const REMINDER_WINDOW_DAYS = 3;

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function emailOwner(tenant, type, data) {
  const owner = await User.findOne({ tenantId: tenant._id, role: 'owner' }).lean();
  if (!owner) return;
  // Platform-to-tenant billing correspondence, sent via the platform's own
  // Brevo identity, not the tenant's own configured sender.
  await enqueueEmail({ tenantId: null, type, to: owner.email, data: { storeName: tenant.businessName, ...data } });
}

/**
 * Runs on a schedule (see jobs/workers/subscriptionRenewal.worker.js) and
 * drives the subscription lifecycle through three lapse phases:
 *   1. active/trial past its end date -> 'past_due' (grace period): the
 *      storefront keeps FULL access while gracePeriodEndsAt hasn't passed.
 *   2. 'past_due' past its gracePeriodEndsAt -> 'expired': the storefront
 *      becomes read-only (checkoutService blocks new orders; browsing and
 *      the admin panel both keep working so the tenant can still pay).
 *   3. A successful payment at any point resets status to 'active'
 *      (subscriptionBillingService.markInvoicePaid) — no special handling
 *      needed here to "recover" from past_due/expired.
 * Also emails the tenant owner a heads-up at each transition, plus an
 * advance reminder before the period even ends.
 */
async function runRenewalCheck() {
  const now = new Date();
  const reminderCutoff = daysFromNow(REMINDER_WINDOW_DAYS);
  const { subscriptionGraceDays } = await platformSettingsService.getSettings();

  const lapsingTenants = await Tenant.find({
    $or: [
      { 'subscription.status': 'trial', 'subscription.trialEndsAt': { $lt: now } },
      { 'subscription.status': 'active', 'subscription.currentPeriodEnd': { $lt: now } },
    ],
  });
  for (const tenant of lapsingTenants) {
    const wasTrial = tenant.subscription.status === 'trial';
    tenant.subscription.status = 'past_due';
    tenant.subscription.gracePeriodEndsAt = daysFromNow(subscriptionGraceDays);
    await tenant.save();
    await tenantService.invalidateTenantCache(tenant);

    await recordAuditLog({
      action: wasTrial ? 'subscription.trial_expired' : 'subscription.period_expired',
      tenantId: tenant._id,
      metadata: { gracePeriodEndsAt: tenant.subscription.gracePeriodEndsAt },
    });
    await platformNotificationService.notify({
      type: wasTrial ? 'subscription_trial_expired' : 'subscription_renewal_due',
      title: 'Subscription lapsed — grace period started',
      message: `${tenant.businessName}'s subscription has lapsed and entered its grace period.`,
      tenantId: tenant._id,
    });
    await emailOwner(tenant, 'subscription_grace_period_started', {
      graceDays: subscriptionGraceDays,
      gracePeriodEndsAt: tenant.subscription.gracePeriodEndsAt.toDateString(),
    });
  }

  const graceExpiredTenants = await Tenant.find({
    'subscription.status': 'past_due',
    'subscription.gracePeriodEndsAt': { $lt: now },
  });
  for (const tenant of graceExpiredTenants) {
    tenant.subscription.status = 'expired';
    await tenant.save();
    await tenantService.invalidateTenantCache(tenant);

    await recordAuditLog({
      action: 'subscription.period_expired',
      tenantId: tenant._id,
      metadata: { reason: 'grace_period_ended' },
    });
    await platformNotificationService.notify({
      type: 'subscription_renewal_due',
      title: 'Store is now read-only',
      message: `${tenant.businessName}'s grace period has ended; the store is no longer accepting new orders.`,
      tenantId: tenant._id,
    });
    await emailOwner(tenant, 'subscription_read_only', {});
  }

  const dueForReminder = await Tenant.find({
    $or: [
      { 'subscription.status': 'trial', 'subscription.trialEndsAt': { $gte: now, $lte: reminderCutoff } },
      { 'subscription.status': 'active', 'subscription.currentPeriodEnd': { $gte: now, $lte: reminderCutoff } },
    ],
  })
    .populate('subscription.planId')
    .lean();

  for (const tenant of dueForReminder) {
    const dueDate = tenant.subscription.trialEndsAt || tenant.subscription.currentPeriodEnd;
    logger.info('Subscription renewal reminder due', {
      tenantId: String(tenant._id),
      businessName: tenant.businessName,
      subscriptionStatus: tenant.subscription.status,
      dueDate,
    });
    await recordAuditLog({
      action: 'subscription.renewal_due',
      tenantId: tenant._id,
      metadata: { status: tenant.subscription.status },
    });
    await platformNotificationService.notify({
      type: 'subscription_renewal_due',
      title: 'Renewal due soon',
      message: `${tenant.businessName}'s subscription is due for renewal.`,
      tenantId: tenant._id,
    });
    await emailOwner(tenant, 'subscription_renewal_reminder', {
      planName: tenant.subscription.planId?.name,
      dueDate: dueDate ? dueDate.toDateString() : 'soon',
    });
  }

  return {
    lapsedIntoGraceCount: lapsingTenants.length,
    graceExpiredCount: graceExpiredTenants.length,
    reminderCount: dueForReminder.length,
  };
}

module.exports = { runRenewalCheck };
