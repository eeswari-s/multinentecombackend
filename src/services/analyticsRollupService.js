const { Tenant } = require('../models/tenant.model');
const { AnalyticsEvent } = require('../models/analyticsEvent.model');
const { AnalyticsRollup } = require('../models/analyticsRollup.model');
const { Order } = require('../models/order.model');
const { Customer } = require('../models/customer.model');
const requestContext = require('../utils/requestContext');
const logger = require('../utils/logger');

const CONFIRMED_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];

function computePeriodBounds(granularity, referenceDate) {
  const start = new Date(referenceDate);
  if (granularity === 'hourly') {
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() - 1); // the last complete hour
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return { periodStart: start, periodEnd: end, hour: start.getHours() };
  }

  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 1); // the last complete day
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { periodStart: start, periodEnd: end, hour: null };
}

function toCountMap(aggregateRows) {
  return Object.fromEntries(aggregateRows.map((row) => [row._id || 'unknown', row.count]));
}

async function buildProductMetrics(periodStart, periodEnd) {
  const rows = await AnalyticsEvent.aggregate([
    {
      $match: {
        createdAt: { $gte: periodStart, $lt: periodEnd },
        productId: { $ne: null },
        type: { $in: ['product_view', 'product_share', 'wishlist_add', 'cart_add'] },
      },
    },
    {
      $group: {
        _id: { productId: '$productId', type: '$type' },
        count: { $sum: 1 },
        uniqueSessions: { $addToSet: '$sessionId' },
        totalViewTimeMs: { $sum: { $ifNull: ['$viewDurationMs', 0] } },
      },
    },
  ]);

  const byProduct = new Map();
  for (const row of rows) {
    const key = String(row._id.productId);
    if (!byProduct.has(key)) {
      byProduct.set(key, {
        productId: row._id.productId,
        views: 0,
        uniqueViews: 0,
        shares: 0,
        wishlistAdds: 0,
        cartAdds: 0,
        totalViewTimeMs: 0,
        unitsSold: 0,
        salesRevenue: 0,
      });
    }
    const entry = byProduct.get(key);
    if (row._id.type === 'product_view') {
      entry.views += row.count;
      entry.uniqueViews += row.uniqueSessions.length;
      entry.totalViewTimeMs += row.totalViewTimeMs;
    } else if (row._id.type === 'product_share') entry.shares += row.count;
    else if (row._id.type === 'wishlist_add') entry.wishlistAdds += row.count;
    else if (row._id.type === 'cart_add') entry.cartAdds += row.count;
  }

  return Array.from(byProduct.values());
}

async function buildOrderMetrics(periodStart, periodEnd) {
  const orders = await Order.find({
    status: { $in: CONFIRMED_STATUSES },
    confirmedAt: { $gte: periodStart, $lt: periodEnd },
  }).lean();

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + o.pricing.grandTotal, 0);

  const distinctCustomerIds = [...new Set(orders.map((o) => String(o.customerId)))];
  const customers = await Customer.find({ _id: { $in: distinctCustomerIds } })
    .select('createdAt')
    .lean();
  const newCustomers = customers.filter((c) => c.createdAt >= periodStart && c.createdAt < periodEnd).length;
  const returningCustomers = distinctCustomerIds.length - newCustomers;

  const couponUsage = new Map();
  const productSales = new Map();
  for (const order of orders) {
    if (order.couponCode) {
      if (!couponUsage.has(order.couponCode)) {
        couponUsage.set(order.couponCode, { code: order.couponCode, uses: 0, discountGiven: 0 });
      }
      const couponEntry = couponUsage.get(order.couponCode);
      couponEntry.uses += 1;
      couponEntry.discountGiven += order.pricing.discountAmount || 0;
    }

    for (const item of order.items) {
      const key = String(item.productId);
      if (!productSales.has(key)) {
        productSales.set(key, { productId: item.productId, unitsSold: 0, salesRevenue: 0 });
      }
      const saleEntry = productSales.get(key);
      saleEntry.unitsSold += item.quantity;
      saleEntry.salesRevenue += item.subtotal;
    }
  }

  return {
    orderMetrics: { totalOrders, totalRevenue, newCustomers, returningCustomers },
    couponMetrics: Array.from(couponUsage.values()),
    productSales,
  };
}

function mergeProductSalesIntoMetrics(productMetrics, productSales) {
  const byId = new Map(productMetrics.map((entry) => [String(entry.productId), entry]));

  for (const [key, sale] of productSales) {
    if (!byId.has(key)) {
      byId.set(key, {
        productId: sale.productId,
        views: 0,
        uniqueViews: 0,
        shares: 0,
        wishlistAdds: 0,
        cartAdds: 0,
        totalViewTimeMs: 0,
        unitsSold: 0,
        salesRevenue: 0,
      });
    }
    const entry = byId.get(key);
    entry.unitsSold += sale.unitsSold;
    entry.salesRevenue += sale.salesRevenue;
  }

  return Array.from(byId.values());
}

async function buildRollupForActiveTenant({ granularity, periodStart, periodEnd, hour }) {
  const [
    viewMetrics,
    { orderMetrics, couponMetrics, productSales },
    deviceAgg,
    browserAgg,
    trafficAgg,
    countryAgg,
    totalSearches,
    totalPageViews,
  ] = await Promise.all([
      buildProductMetrics(periodStart, periodEnd),
      buildOrderMetrics(periodStart, periodEnd),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: periodStart, $lt: periodEnd } } },
        { $group: { _id: '$device', count: { $sum: 1 } } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: periodStart, $lt: periodEnd } } },
        { $group: { _id: '$browser', count: { $sum: 1 } } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: periodStart, $lt: periodEnd } } },
        { $group: { _id: '$trafficSource', count: { $sum: 1 } } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: periodStart, $lt: periodEnd } } },
        { $group: { _id: '$country', count: { $sum: 1 } } },
      ]),
      AnalyticsEvent.countDocuments({ createdAt: { $gte: periodStart, $lt: periodEnd }, type: 'search' }),
      AnalyticsEvent.countDocuments({ createdAt: { $gte: periodStart, $lt: periodEnd }, type: 'page_view' }),
    ]);

  const productMetrics = mergeProductSalesIntoMetrics(viewMetrics, productSales);

  await AnalyticsRollup.findOneAndUpdate(
    { granularity, periodStart },
    {
      $set: {
        granularity,
        periodStart,
        hour,
        productMetrics,
        deviceBreakdown: toCountMap(deviceAgg),
        browserBreakdown: toCountMap(browserAgg),
        trafficSourceBreakdown: toCountMap(trafficAgg),
        countryBreakdown: toCountMap(countryAgg),
        orderMetrics,
        couponMetrics,
        offerMetrics: [],
        totalSearches,
        totalPageViews,
      },
    },
    { upsert: true }
  );
}

/**
 * Iterates every active tenant and builds one rollup document for the last
 * complete period (hour or day). Runs on a schedule (see
 * jobs/workers/analyticsRollup.worker.js) — dashboards only ever read
 * AnalyticsRollup, never AnalyticsEvent directly.
 */
async function runRollup(granularity) {
  const tenants = await Tenant.find({ status: 'active' }).lean();
  const { periodStart, periodEnd, hour } = computePeriodBounds(granularity, new Date());

  for (const tenant of tenants) {
    try {
      await requestContext.run({ tenantId: String(tenant._id), tenant }, () =>
        buildRollupForActiveTenant({ granularity, periodStart, periodEnd, hour })
      );
    } catch (err) {
      logger.error('Analytics rollup failed for tenant', {
        tenantId: String(tenant._id),
        granularity,
        error: err.message,
      });
    }
  }

  return { granularity, periodStart, periodEnd, tenantCount: tenants.length };
}

module.exports = { runRollup, computePeriodBounds };
