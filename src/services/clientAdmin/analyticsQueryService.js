const { AnalyticsRollup } = require('../../models/analyticsRollup.model');

function mergeCountMaps(maps) {
  const result = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map || {})) {
      result[key] = (result[key] || 0) + value;
    }
  }
  return result;
}

function mergeProductMetrics(rollups) {
  const byId = new Map();
  for (const rollup of rollups) {
    for (const entry of rollup.productMetrics) {
      const key = String(entry.productId);
      if (!byId.has(key)) {
        byId.set(key, { productId: entry.productId, views: 0, uniqueViews: 0, shares: 0, wishlistAdds: 0, cartAdds: 0, totalViewTimeMs: 0, unitsSold: 0, salesRevenue: 0 });
      }
      const acc = byId.get(key);
      acc.views += entry.views;
      acc.uniqueViews += entry.uniqueViews;
      acc.shares += entry.shares;
      acc.wishlistAdds += entry.wishlistAdds;
      acc.cartAdds += entry.cartAdds;
      acc.totalViewTimeMs += entry.totalViewTimeMs;
      acc.unitsSold += entry.unitsSold;
      acc.salesRevenue += entry.salesRevenue;
    }
  }
  return Array.from(byId.values());
}

function topN(products, key, n = 10) {
  return [...products].sort((a, b) => b[key] - a[key]).slice(0, n);
}
function bottomN(products, key, n = 10) {
  return [...products].sort((a, b) => a[key] - b[key]).slice(0, n);
}

async function getAnalyticsSummary({ granularity, startDate, endDate }) {
  const rollups = await AnalyticsRollup.find({
    granularity,
    periodStart: { $gte: startDate, $lt: endDate },
  }).lean();

  const products = mergeProductMetrics(rollups);

  const orderMetrics = rollups.reduce(
    (acc, r) => ({
      totalOrders: acc.totalOrders + r.orderMetrics.totalOrders,
      totalRevenue: acc.totalRevenue + r.orderMetrics.totalRevenue,
      newCustomers: acc.newCustomers + r.orderMetrics.newCustomers,
      returningCustomers: acc.returningCustomers + r.orderMetrics.returningCustomers,
    }),
    { totalOrders: 0, totalRevenue: 0, newCustomers: 0, returningCustomers: 0 }
  );

  const couponUsage = new Map();
  for (const rollup of rollups) {
    for (const coupon of rollup.couponMetrics) {
      if (!couponUsage.has(coupon.code)) couponUsage.set(coupon.code, { code: coupon.code, uses: 0, discountGiven: 0 });
      const entry = couponUsage.get(coupon.code);
      entry.uses += coupon.uses;
      entry.discountGiven += coupon.discountGiven;
    }
  }

  const totalPageViews = rollups.reduce((sum, r) => sum + r.totalPageViews, 0);
  const totalSearches = rollups.reduce((sum, r) => sum + r.totalSearches, 0);
  const totalProductViews = products.reduce((sum, p) => sum + p.views, 0);
  const totalViewTimeMs = products.reduce((sum, p) => sum + p.totalViewTimeMs, 0);

  const conversionRate = totalPageViews > 0 ? orderMetrics.totalOrders / totalPageViews : 0;
  const averageViewTimeMs = totalProductViews > 0 ? totalViewTimeMs / totalProductViews : 0;

  return {
    period: { granularity, startDate, endDate },
    deviceBreakdown: mergeCountMaps(rollups.map((r) => r.deviceBreakdown)),
    browserBreakdown: mergeCountMaps(rollups.map((r) => r.browserBreakdown)),
    trafficSourceBreakdown: mergeCountMaps(rollups.map((r) => r.trafficSourceBreakdown)),
    countryBreakdown: mergeCountMaps(rollups.map((r) => r.countryBreakdown)),
    orderMetrics,
    couponMetrics: Array.from(couponUsage.values()),
    totalPageViews,
    totalSearches,
    conversionRate,
    averageViewTimeMs,
    products: {
      mostViewed: topN(products, 'views'),
      leastViewed: bottomN(products, 'views'),
      mostShared: topN(products, 'shares'),
      mostWishlisted: topN(products, 'wishlistAdds'),
      mostCartAdded: topN(products, 'cartAdds'),
      bestSelling: topN(products, 'unitsSold'),
      lowSelling: bottomN(products, 'unitsSold'),
    },
  };
}

module.exports = { getAnalyticsSummary };
