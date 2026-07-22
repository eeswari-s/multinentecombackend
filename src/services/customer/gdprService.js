const { Customer } = require('../../models/customer.model');
const { Order } = require('../../models/order.model');
const { Review } = require('../../models/review.model');
const { WishlistItem } = require('../../models/wishlist.model');
const { SavedItem } = require('../../models/savedItem.model');
const { BackInStockSubscription } = require('../../models/backInStockSubscription.model');
const { NewsletterSubscriber } = require('../../models/newsletterSubscriber.model');
const { SupportEnquiry } = require('../../models/supportEnquiry.model');
const refreshTokenStore = require('../refreshTokenStore');
const logger = require('../../utils/logger');
const ApiError = require('../../utils/ApiError');

const PERSONA = 'customer';

/**
 * A full export of everything this customer's own account holds, across
 * every collection that references them — the GDPR "right to access" /
 * data portability request, self-serve rather than routed through
 * support.
 */
async function exportMyData(customerId) {
  const [customer, orders, reviews, wishlist, savedItems, backInStockSubs, enquiries] = await Promise.all([
    Customer.findById(customerId).lean(),
    Order.find({ customerId, status: { $ne: 'cart' } }).lean(),
    Review.find({ customerId }).lean(),
    WishlistItem.find({ customerId }).lean(),
    SavedItem.find({ customerId }).lean(),
    BackInStockSubscription.find({ customerId }).lean(),
    SupportEnquiry.find({ customerId }).lean(),
  ]);

  if (!customer) throw ApiError.notFound('Account not found');

  return {
    exportedAt: new Date(),
    profile: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      addresses: customer.addresses,
      loyalty: customer.loyalty,
      createdAt: customer.createdAt,
    },
    orders,
    reviews,
    wishlist,
    savedItems,
    backInStockSubscriptions: backInStockSubs,
    supportEnquiries: enquiries,
  };
}

/**
 * GDPR "right to erasure" — anonymizes rather than hard-deletes. Orders
 * must be retained for tax/audit purposes (GST invoice retention law), so
 * their shipping PII is scrubbed but the transactional record (items,
 * pricing, GST, order/invoice numbers) stays intact. Everything that is
 * purely the customer's own preference data (wishlist, saved items,
 * back-in-stock subscriptions, newsletter subscription) is hard-deleted.
 * The Customer document itself is anonymized, not removed, so existing
 * Order/Review references don't dangle — its status becomes 'deleted',
 * which already blocks login (see customerAuthService).
 */
async function deleteMyAccount(customerId) {
  const customer = await Customer.findById(customerId);
  if (!customer) throw ApiError.notFound('Account not found');

  const anonymizedEmail = `deleted-${customer._id}@anonymized.local`;

  await Order.updateMany(
    { customerId },
    {
      $set: {
        'shippingAddress.name': '[deleted]',
        'shippingAddress.phone': '[deleted]',
        'shippingAddress.line1': '[deleted]',
        'shippingAddress.line2': '[deleted]',
      },
    }
  );

  await Promise.all([
    WishlistItem.deleteMany({ customerId }),
    SavedItem.deleteMany({ customerId }),
    BackInStockSubscription.deleteMany({ customerId }),
    NewsletterSubscriber.deleteOne({ email: customer.email }),
  ]);

  customer.name = 'Deleted Customer';
  customer.email = anonymizedEmail;
  customer.phone = null;
  customer.addresses = [];
  customer.status = 'deleted';
  customer.passwordHash = 'account-deleted'; // not a valid bcrypt hash — comparePassword will simply never match
  await customer.save();

  await refreshTokenStore.revokeAllDevices({ persona: PERSONA, userId: String(customerId) });

  // Not logged to ActivityLog — that log is specifically for Client Admin
  // staff actions (its actorUserId refs the admin User model, required),
  // and this is a customer's own self-service action, not an admin one.
  logger.info('Customer account deleted (GDPR self-service)', { customerId: String(customer._id) });
}

module.exports = { exportMyData, deleteMyAccount };
