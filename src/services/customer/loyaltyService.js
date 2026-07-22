const crypto = require('crypto');
const { Customer } = require('../../models/customer.model');
const { Order } = require('../../models/order.model');

const SIGNUP_REFERRAL_BONUS = 50; // awarded to the new customer for entering a valid referral code
const REFERRER_ORDER_BONUS = 100; // awarded to the referrer once their referee's first order is delivered

function generateReferralCode(name) {
  const base = (name || 'USER')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 5)
    .toUpperCase();
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${base || 'USER'}${suffix}`;
}

/** Called at registration — assigns a unique referral code, and links to a referrer's code if one was supplied. */
async function initializeLoyalty({ customer, referralCode }) {
  let code = generateReferralCode(customer.name);
  while (await Customer.exists({ 'loyalty.referralCode': code })) {
    code = generateReferralCode(customer.name);
  }

  customer.loyalty.referralCode = code;

  if (referralCode) {
    const referrer = await Customer.findOne({ 'loyalty.referralCode': referralCode.toUpperCase() });
    if (referrer && String(referrer._id) !== String(customer._id)) {
      customer.loyalty.referredByCode = referrer.loyalty.referralCode;
      customer.loyalty.points += SIGNUP_REFERRAL_BONUS;
    }
  }

  await customer.save();
}

/**
 * Called once an order reaches "delivered" — rewards the referrer, but only
 * for the referee's FIRST delivered order, so a referral can't be farmed by
 * repeatedly ordering.
 */
async function rewardReferrerOnFirstDelivery({ customerId }) {
  const customer = await Customer.findById(customerId);
  if (!customer || !customer.loyalty.referredByCode) return;

  const deliveredOrderCount = await Order.countDocuments({ customerId, status: 'delivered' });
  if (deliveredOrderCount > 1) return; // this delivery isn't their first (called after this order was already saved as delivered)

  const referrer = await Customer.findOne({ 'loyalty.referralCode': customer.loyalty.referredByCode });
  if (!referrer) return;

  referrer.loyalty.points += REFERRER_ORDER_BONUS;
  await referrer.save();
}

async function getLoyaltySummary(customerId) {
  const customer = await Customer.findById(customerId).select('loyalty').lean();
  const referredCount = await Customer.countDocuments({ 'loyalty.referredByCode': customer.loyalty.referralCode });
  return { ...customer.loyalty, referredCount };
}

module.exports = { initializeLoyalty, rewardReferrerOnFirstDelivery, getLoyaltySummary, SIGNUP_REFERRAL_BONUS, REFERRER_ORDER_BONUS };
