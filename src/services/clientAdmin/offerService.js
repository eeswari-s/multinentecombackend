const { Offer } = require('../../models/offer.model');
const { Product } = require('../../models/product.model');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

const SIMPLE_DISCOUNT_TYPES = ['flash_sale', 'deal_of_the_day', 'festival', 'limited_time'];

function computeOfferPrice(price, discountType, discountValue) {
  const discounted = discountType === 'percentage' ? price - (price * discountValue) / 100 : price - discountValue;
  return Math.max(round2(discounted), 0);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/** Sets variant.offerPrice for every variant of the offer's applicable products. */
async function applySimpleDiscount(offer) {
  const products = await Product.find({ _id: { $in: offer.applicableProducts } });
  for (const product of products) {
    for (const variant of product.variants) {
      variant.offerPrice = computeOfferPrice(variant.price, offer.discountType, offer.discountValue);
    }
    await product.save();
  }
}

/** Clears offerPrice back to null for the offer's applicable products. */
async function clearSimpleDiscount(offer) {
  const products = await Product.find({ _id: { $in: offer.applicableProducts } });
  for (const product of products) {
    for (const variant of product.variants) {
      variant.offerPrice = undefined;
    }
    await product.save();
  }
}

async function createOffer({ actor, ...data }) {
  if (SIMPLE_DISCOUNT_TYPES.includes(data.type) && (!data.applicableProducts || data.applicableProducts.length === 0)) {
    throw ApiError.badRequest('applicableProducts is required for this offer type');
  }
  if (data.type === 'combo' && (!data.comboProductIds || data.comboProductIds.length < 2)) {
    throw ApiError.badRequest('A combo offer needs at least two comboProductIds');
  }
  if (data.type === 'buy_x_get_y' && (!data.buyProductId || !data.getProductId)) {
    throw ApiError.badRequest('buy_x_get_y requires buyProductId and getProductId');
  }

  const offer = await Offer.create(data);

  const now = new Date();
  if (SIMPLE_DISCOUNT_TYPES.includes(offer.type) && offer.isActive && now >= offer.startAt && now <= offer.endAt) {
    await applySimpleDiscount(offer);
  }

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'offer.created',
    targetType: 'Offer',
    targetId: offer._id,
    metadata: { type: offer.type },
  });

  return offer;
}

async function listOffers({ isActive }) {
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  return Offer.find(filter).sort({ createdAt: -1 }).lean();
}

async function deactivateOffer({ id, actor }) {
  const offer = await Offer.findById(id);
  if (!offer) throw ApiError.notFound('Offer not found');

  offer.isActive = false;
  await offer.save();

  if (SIMPLE_DISCOUNT_TYPES.includes(offer.type)) {
    await clearSimpleDiscount(offer);
  }

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'offer.deactivated',
    targetType: 'Offer',
    targetId: offer._id,
  });

  return offer;
}

async function deleteOffer({ id, actor }) {
  const offer = await Offer.findById(id);
  if (!offer) throw ApiError.notFound('Offer not found');

  if (SIMPLE_DISCOUNT_TYPES.includes(offer.type) && offer.isActive) {
    await clearSimpleDiscount(offer);
  }
  await offer.deleteOne();

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'offer.deleted',
    targetType: 'Offer',
    targetId: offer._id,
  });
}

module.exports = { createOffer, listOffers, deactivateOffer, deleteOffer };
