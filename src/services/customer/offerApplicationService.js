const { Offer } = require('../../models/offer.model');

function round2(value) {
  return Math.round(value * 100) / 100;
}

async function getActiveCartLevelOffers() {
  const now = new Date();
  return Offer.find({
    type: { $in: ['combo', 'buy_x_get_y'] },
    isActive: true,
    startAt: { $lte: now },
    endAt: { $gte: now },
  }).lean();
}

function applyComboDiscount(offer, items) {
  const comboIds = offer.comboProductIds.map(String);
  const matchedItems = items.filter((item) => comboIds.includes(String(item.productId)));

  const allPresent = comboIds.every((id) => matchedItems.some((item) => String(item.productId) === id));
  if (!allPresent) return 0;

  const matchedSubtotal = matchedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const discount =
    offer.discountType === 'percentage' ? (matchedSubtotal * offer.discountValue) / 100 : offer.discountValue;
  return Math.min(discount, matchedSubtotal);
}

function applyBuyXGetYDiscount(offer, items) {
  const buyItem = items.find((item) => String(item.productId) === String(offer.buyProductId));
  const getItem = items.find((item) => String(item.productId) === String(offer.getProductId));
  if (!buyItem || !getItem) return 0;

  const eligibleGroups = Math.floor(buyItem.quantity / offer.buyQuantity);
  if (eligibleGroups === 0) return 0;

  const freeUnits = Math.min(eligibleGroups * offer.getQuantity, getItem.quantity);
  return round2(freeUnits * getItem.unitPrice * (offer.getDiscountPercent / 100));
}

/**
 * Cart-level offer discounts (combo/buy_x_get_y) — distinct from a
 * customer-applied coupon, and additive with it. Simple time-boxed
 * discounts (flash_sale/deal_of_the_day/festival/limited_time) don't need
 * this: they're already baked into variant.offerPrice by offerService.
 */
async function calculateCartLevelOfferDiscount(items) {
  if (items.length === 0) return 0;

  const offers = await getActiveCartLevelOffers();
  let totalDiscount = 0;

  for (const offer of offers) {
    if (offer.type === 'combo') {
      totalDiscount += applyComboDiscount(offer, items);
    } else if (offer.type === 'buy_x_get_y') {
      totalDiscount += applyBuyXGetYDiscount(offer, items);
    }
  }

  return round2(totalDiscount);
}

async function listActiveOffersForStorefront() {
  const now = new Date();
  return Offer.find({ isActive: true, startAt: { $lte: now }, endAt: { $gte: now } })
    .select('name type description startAt endAt applicableProducts comboProductIds buyProductId getProductId')
    .lean();
}

module.exports = { calculateCartLevelOfferDiscount, listActiveOffersForStorefront };
