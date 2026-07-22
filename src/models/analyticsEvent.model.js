const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const EVENT_TYPES = [
  'product_view',
  'product_share',
  'wishlist_add',
  'cart_add',
  'search',
  'page_view',
];

/**
 * Raw, append-only analytics events — high write volume by design.
 * Dashboards must never query this collection directly (section 9); they
 * read from AnalyticsRollup, which analyticsRollup workers build from
 * these events on a schedule.
 */
const analyticsEventSchema = new Schema(
  {
    type: { type: String, enum: EVENT_TYPES, required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    sessionId: { type: String, required: true },

    device: { type: String, enum: ['mobile', 'desktop', 'tablet', 'unknown'], default: 'unknown' },
    browser: { type: String, trim: true, default: 'unknown' },
    country: { type: String, trim: true, default: 'unknown' },
    trafficSource: { type: String, trim: true, default: 'direct' },

    viewDurationMs: { type: Number, default: null },
    searchQuery: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

analyticsEventSchema.plugin(tenantScopePlugin);

analyticsEventSchema.index({ tenantId: 1, createdAt: -1 });
analyticsEventSchema.index({ tenantId: 1, type: 1, productId: 1, createdAt: -1 });
analyticsEventSchema.index({ tenantId: 1, customerId: 1, type: 1, createdAt: -1 });

const AnalyticsEvent = mongoose.model('AnalyticsEvent', analyticsEventSchema);

module.exports = { AnalyticsEvent, EVENT_TYPES };
