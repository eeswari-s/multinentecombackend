const { SubscriptionInvoice } = require('../../models/subscriptionInvoice.model');
const { runAcrossAllTenants } = require('./crossTenantAccess');

/**
 * Cross-tenant SaaS payment history / failed-payments view — the narrow,
 * explicitly-named exception to tenant isolation (see crossTenantAccess.js
 * and tenantScope.plugin.js).
 */
async function listAllInvoices({ page = 1, limit = 20, status, tenantId }) {
  const filter = {};
  if (status) filter.status = status;
  if (tenantId) filter.tenantId = tenantId;

  return runAcrossAllTenants(async () => {
    const [items, total] = await Promise.all([
      SubscriptionInvoice.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('planId')
        .lean(),
      SubscriptionInvoice.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  });
}

/**
 * Flow A reconciliation: what the platform actually collected vs failed
 * to collect from tenants, across all tenants, for a date range. There is
 * no subscription-refund capability built (SaaS billing refunds are
 * handled manually/case-by-case, not a self-serve flow), so this only
 * reports paid vs failed, not a refunded column.
 */
async function getReconciliationSummary({ startDate, endDate }) {
  const filter = {};
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  return runAcrossAllTenants(async () => {
    const byStatus = await SubscriptionInvoice.aggregate([
      { $match: filter },
      { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    const summary = Object.fromEntries(byStatus.map((row) => [row._id, { amount: row.amount, count: row.count }]));
    return {
      paid: summary.paid || { amount: 0, count: 0 },
      failed: summary.failed || { amount: 0, count: 0 },
      pending: summary.pending || { amount: 0, count: 0 },
    };
  });
}

module.exports = { listAllInvoices, getReconciliationSummary };
