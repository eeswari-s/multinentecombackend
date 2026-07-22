const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const OFFER_TYPES = ['flash_sale', 'deal_of_the_day', 'festival', 'limited_time', 'combo', 'buy_x_get_y'];
const DISCOUNT_TYPES = ['percentage', 'fixed'];

/**
 * Two mechanics share this one model:
 *  - flash_sale/deal_of_the_day/festival/limited_time: a time-boxed
 *    discount applied directly to selected products' variant.offerPrice
 *    (simple_discount fields below).
 *  - combo/buy_x_get_y: cart-level conditions evaluated at pricing time
 *    (combo/bogo fields below) — see offerApplicationService.js.
 */
const offerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: OFFER_TYPES, required: true },
    description: { type: String, trim: true },

    // simple_discount (flash_sale / deal_of_the_day / festival / limited_time)
    applicableProducts: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
    discountType: { type: String, enum: DISCOUNT_TYPES },
    discountValue: { type: Number, min: 0 },

    // combo
    comboProductIds: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },

    // buy_x_get_y
    buyProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
    buyQuantity: { type: Number, min: 1 },
    getProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
    getQuantity: { type: Number, min: 1 },
    getDiscountPercent: { type: Number, min: 0, max: 100 }, // 100 = free

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

offerSchema.plugin(tenantScopePlugin);

offerSchema.index({ tenantId: 1, isActive: 1, startAt: 1, endAt: 1 });

const Offer = mongoose.model('Offer', offerSchema);

module.exports = { Offer, OFFER_TYPES, DISCOUNT_TYPES };
