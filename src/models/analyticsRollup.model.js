const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const GRANULARITIES = ['hourly', 'daily'];

const productMetricSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    views: { type: Number, default: 0 },
    uniqueViews: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    wishlistAdds: { type: Number, default: 0 },
    cartAdds: { type: Number, default: 0 },
    totalViewTimeMs: { type: Number, default: 0 },
    unitsSold: { type: Number, default: 0 },
    salesRevenue: { type: Number, default: 0 },
  },
  { _id: false }
);

/**
 * Pre-aggregated analytics dashboards actually read from — never the raw
 * AnalyticsEvent collection (section 9). One document per
 * (tenant, granularity, periodStart); `hour` is null for daily rollups.
 */
const analyticsRollupSchema = new Schema(
  {
    granularity: { type: String, enum: GRANULARITIES, required: true },
    periodStart: { type: Date, required: true },
    hour: { type: Number, min: 0, max: 23, default: null },

    productMetrics: { type: [productMetricSchema], default: [] },

    deviceBreakdown: { type: Map, of: Number, default: {} },
    browserBreakdown: { type: Map, of: Number, default: {} },
    trafficSourceBreakdown: { type: Map, of: Number, default: {} },
    countryBreakdown: { type: Map, of: Number, default: {} },

    orderMetrics: {
      totalOrders: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      newCustomers: { type: Number, default: 0 },
      returningCustomers: { type: Number, default: 0 },
    },

    couponMetrics: {
      type: [{ code: String, uses: Number, discountGiven: Number }],
      default: [],
      _id: false,
    },
    offerMetrics: {
      type: [{ offerId: Schema.Types.ObjectId, uses: Number }],
      default: [],
      _id: false,
    },

    totalPageViews: { type: Number, default: 0 },
    totalSearches: { type: Number, default: 0 },
  },
  { timestamps: true }
);

analyticsRollupSchema.plugin(tenantScopePlugin);

analyticsRollupSchema.index({ tenantId: 1, granularity: 1, periodStart: 1 }, { unique: true });

const AnalyticsRollup = mongoose.model('AnalyticsRollup', analyticsRollupSchema);

module.exports = { AnalyticsRollup, GRANULARITIES };
