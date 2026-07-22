const mongoose = require('mongoose');
const { Order } = require('../../models/order.model');
const { Customer } = require('../../models/customer.model');
const { WishlistItem } = require('../../models/wishlist.model');
const loyaltyService = require('./loyaltyService');

async function getDashboard(customerId) {
  const [customer, orderCountsAgg, wishlistCount, loyalty] = await Promise.all([
    Customer.findById(customerId).select('name email phone addresses loyalty createdAt').lean(),
    Order.aggregate([
      { $match: { customerId: new mongoose.Types.ObjectId(customerId), status: { $ne: 'cart' } } },
      { $group: { _id: '$status', count: { $sum: 1 }, totalSpent: { $sum: '$pricing.grandTotal' } } },
    ]),
    WishlistItem.countDocuments({ customerId }),
    loyaltyService.getLoyaltySummary(customerId),
  ]);

  const ordersByStatus = Object.fromEntries(orderCountsAgg.map((row) => [row._id, row.count]));
  const totalOrders = orderCountsAgg.reduce((sum, row) => sum + row.count, 0);
  const totalSpent = orderCountsAgg.reduce((sum, row) => sum + (row.totalSpent || 0), 0);

  return {
    profile: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      memberSince: customer.createdAt,
    },
    orders: { total: totalOrders, byStatus: ordersByStatus, totalSpent },
    addressCount: customer.addresses.length,
    wishlistCount,
    loyalty,
  };
}

module.exports = { getDashboard };
