const { AnalyticsEvent } = require('../../models/analyticsEvent.model');
const { Product } = require('../../models/product.model');

const RECENT_LIMIT = 20;

/**
 * Reads from the raw AnalyticsEvent stream, scoped to a single customer's
 * own events by _id — unlike the aggregate dashboards (section 9), which
 * must never query raw events, a customer reading their OWN recent
 * activity is a normal, cheap, narrowly-scoped lookup, not a reporting
 * query, so going straight to AnalyticsEvent here is intentional.
 */
async function getRecentlyViewedProducts(customerId) {
  const events = await AnalyticsEvent.find({ customerId, type: 'product_view', productId: { $ne: null } })
    .sort({ createdAt: -1 })
    .limit(100)
    .select('productId createdAt')
    .lean();

  const seen = new Set();
  const orderedProductIds = [];
  for (const event of events) {
    const key = String(event.productId);
    if (!seen.has(key)) {
      seen.add(key);
      orderedProductIds.push(event.productId);
    }
    if (orderedProductIds.length >= RECENT_LIMIT) break;
  }

  const products = await Product.find({ _id: { $in: orderedProductIds }, status: 'published' })
    .select('name slug brand images priceRange ratingsAverage ratingsCount')
    .lean();
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  return orderedProductIds.map((id) => productsById.get(String(id))).filter(Boolean);
}

async function getRecentSearches(customerId) {
  const events = await AnalyticsEvent.find({ customerId, type: 'search', searchQuery: { $ne: null } })
    .sort({ createdAt: -1 })
    .limit(100)
    .select('searchQuery createdAt')
    .lean();

  const seen = new Set();
  const queries = [];
  for (const event of events) {
    const key = event.searchQuery.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      queries.push({ query: event.searchQuery, searchedAt: event.createdAt });
    }
    if (queries.length >= RECENT_LIMIT) break;
  }

  return queries;
}

module.exports = { getRecentlyViewedProducts, getRecentSearches };
