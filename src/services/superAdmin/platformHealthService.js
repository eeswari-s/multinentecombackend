const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Tenant } = require('../../models/tenant.model');
const { SubscriptionPlan } = require('../../models/subscriptionPlan.model');
const { redisClient } = require('../../config/redis');
const cloudinary = require('../../integrations/cloudinary/client');
const logger = require('../../utils/logger');

const { getEmailQueue } = require('../../jobs/queues/email.queue');
const { getPdfQueue } = require('../../jobs/queues/pdf.queue');
const { getSubscriptionRenewalQueue } = require('../../jobs/queues/subscriptionRenewal.queue');
const { getAnalyticsIngestionQueue } = require('../../jobs/queues/analyticsIngestion.queue');
const { getAnalyticsRollupQueue } = require('../../jobs/queues/analyticsRollup.queue');

const MONTHS_PER_CYCLE = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
  // A lifetime deal is a one-time payment, not a recurring charge, so it
  // contributes nothing to Monthly Recurring Revenue by definition.
  lifetime: null,
};

const MONGOOSE_READY_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

const QUEUE_GETTERS = {
  'email-send': getEmailQueue,
  'pdf-generate': getPdfQueue,
  'subscription-renewal': getSubscriptionRenewalQueue,
  'analytics-ingestion': getAnalyticsIngestionQueue,
  'analytics-rollup': getAnalyticsRollupQueue,
};

function toCountMap(rows) {
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

/**
 * Monthly Recurring Revenue: every active-subscription tenant's plan price,
 * normalized to a monthly figure by its billing cycle. Computed from the
 * SubscriptionPlan catalog (not SubscriptionInvoice history) since MRR is a
 * forward-looking "what are we currently committed to bill" figure, not a
 * backward-looking "what did we actually collect" figure — the latter is
 * covered separately by the invoice-history view (billingOverviewService).
 */
async function computeMrr(activeTenants) {
  const planIds = [...new Set(activeTenants.filter((t) => t.subscription?.planId).map((t) => String(t.subscription.planId)))];
  if (planIds.length === 0) return 0;

  const plans = await SubscriptionPlan.find({ _id: { $in: planIds } }).lean();
  const planById = new Map(plans.map((p) => [String(p._id), p]));

  let mrrPaise = 0;
  for (const tenant of activeTenants) {
    const plan = tenant.subscription?.planId ? planById.get(String(tenant.subscription.planId)) : null;
    const cycle = tenant.subscription?.billingCycle;
    const months = MONTHS_PER_CYCLE[cycle];
    if (!plan || !months) continue;

    const price = plan.pricing instanceof Map ? plan.pricing.get(cycle) : plan.pricing?.[cycle];
    if (typeof price === 'number') {
      mrrPaise += price / months;
    }
  }

  return Math.round(mrrPaise);
}

/**
 * Simple trailing-30-day churn rate: tenants whose subscription was
 * cancelled in the window, divided by tenants who were active at any point
 * up to the window's start. Approximate by design — a full cohort-based
 * churn model is out of scope for a platform health snapshot.
 */
function computeChurnRate(tenants, windowStart) {
  const cancelledInWindow = tenants.filter(
    (t) => t.subscription?.status === 'cancelled' && t.subscription?.cancelledAt && t.subscription.cancelledAt >= windowStart
  ).length;

  const eligibleBase = tenants.filter((t) => t.createdAt < windowStart).length;
  if (eligibleBase === 0) return 0;

  return Math.round((cancelledInWindow / eligibleBase) * 10000) / 100;
}

async function getQueueHealth() {
  const results = {};
  await Promise.all(
    Object.entries(QUEUE_GETTERS).map(async ([name, getQueue]) => {
      try {
        const counts = await getQueue().getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        results[name] = { status: 'ok', counts };
      } catch (err) {
        logger.error('Queue health check failed', { queue: name, error: err.message });
        results[name] = { status: 'error', error: err.message };
      }
    })
  );
  return results;
}

function getSystemStatus() {
  return {
    uptimeSeconds: Math.round(process.uptime()),
    mongo: {
      status: MONGOOSE_READY_STATES[mongoose.connection.readyState] || 'unknown',
    },
    redis: {
      status: redisClient.status, // ioredis: 'connecting' | 'connect' | 'ready' | 'close' | 'end' | 'reconnecting'
    },
  };
}

/**
 * Storage usage across the two places the platform actually stores bytes:
 * MongoDB (via the driver's dbStats command) and Cloudinary (via its Admin
 * API's account-wide usage endpoint — media is never stored in Mongo
 * itself, per section 5's URL-only rule). Each call is independently
 * wrapped: Cloudinary's Admin API requires network access this dashboard
 * shouldn't hard-fail without if it's ever briefly unreachable.
 */
async function getStorageUsage() {
  const [mongoResult, cloudinaryResult] = await Promise.allSettled([
    mongoose.connection.db.stats(),
    cloudinary.api.usage(),
  ]);

  const mongo =
    mongoResult.status === 'fulfilled'
      ? { status: 'ok', dataSizeBytes: mongoResult.value.dataSize, storageSizeBytes: mongoResult.value.storageSize }
      : { status: 'error', error: mongoResult.reason.message };

  const cloudinaryUsage =
    cloudinaryResult.status === 'fulfilled'
      ? {
          status: 'ok',
          storageBytes: cloudinaryResult.value.storage?.usage,
          bandwidthBytes: cloudinaryResult.value.bandwidth?.usage,
          credits: cloudinaryResult.value.credits?.usage,
        }
      : { status: 'error', error: cloudinaryResult.reason.message };

  return { mongo, cloudinary: cloudinaryUsage };
}

/**
 * Tails the last `limit` entries from the JSON-lines error log (see
 * utils/logger.js) for a quick "what's been erroring" view without needing
 * shell access to the server. Tolerant of a missing file (fresh checkout,
 * nothing has errored yet) and of any malformed line (skipped, not fatal).
 */
async function getRecentErrorLogs(limit = 50) {
  const logPath = path.resolve(process.cwd(), 'logs/error.log');
  if (!fs.existsSync(logPath)) return [];

  const lines = [];
  const rl = readline.createInterface({ input: fs.createReadStream(logPath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }

  return lines
    .slice(-limit)
    .reverse()
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { message: line };
      }
    });
}

/**
 * The single Super Admin "platform health" snapshot: tenant counts, MRR,
 * churn, and background system status (DB/Redis/queues). Intentionally
 * pulls from the Tenant collection (not tenant-scoped, so no cross-tenant
 * bypass needed for it) plus the narrow crossTenantAccess bypass for the
 * subscription-plan-catalog join, which is itself platform-level, not
 * tenant-scoped, data.
 */
async function getPlatformHealth() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [tenants, statusAgg, subscriptionStatusAgg] = await Promise.all([
    Tenant.find().select('status subscription createdAt').lean(),
    Tenant.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Tenant.aggregate([{ $group: { _id: '$subscription.status', count: { $sum: 1 } } }]),
  ]);

  const activeTenants = tenants.filter((t) => t.status === 'active' && t.subscription?.status === 'active');
  const newSignups30d = tenants.filter((t) => t.createdAt >= thirtyDaysAgo).length;

  const [mrr, queues, storage, recentErrors] = await Promise.all([
    computeMrr(activeTenants),
    getQueueHealth(),
    getStorageUsage(),
    getRecentErrorLogs(50),
  ]);

  return {
    tenants: {
      total: tenants.length,
      byStatus: toCountMap(statusAgg),
      bySubscriptionStatus: toCountMap(subscriptionStatusAgg),
      newSignupsLast30Days: newSignups30d,
    },
    revenue: {
      mrr,
      currency: 'INR',
      activeSubscriptions: activeTenants.length,
    },
    churn: {
      ratePercent: computeChurnRate(tenants, thirtyDaysAgo),
      windowDays: 30,
    },
    system: getSystemStatus(),
    queues,
    storage,
    recentErrors,
    generatedAt: now,
  };
}

module.exports = { getPlatformHealth };
