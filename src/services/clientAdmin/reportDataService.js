const { Order } = require('../../models/order.model');
const { Customer } = require('../../models/customer.model');
const { Product } = require('../../models/product.model');

const CONFIRMED_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];

function dateRangeFilter(field, startDate, endDate) {
  const filter = {};
  if (startDate) filter.$gte = new Date(startDate);
  if (endDate) filter.$lte = new Date(endDate);
  return Object.keys(filter).length ? { [field]: filter } : {};
}

/**
 * Flow B reconciliation: what was actually captured vs refunded through
 * this tenant's own Razorpay account, for a given period. "Captured" is
 * every confirmed order's grandTotal regardless of refund status (the
 * charge did happen); "refunded" is summed separately so the report shows
 * both sides rather than netting them silently.
 */
async function getReconciliationReportData({ startDate, endDate }) {
  const filter = { status: { $in: CONFIRMED_STATUSES }, ...dateRangeFilter('confirmedAt', startDate, endDate) };
  const orders = await Order.find(filter)
    .select('orderNumber confirmedAt pricing paymentMethod paymentStatus refund')
    .sort({ confirmedAt: -1 })
    .lean();

  const capturedAmount = orders.reduce((sum, o) => sum + o.pricing.grandTotal, 0);
  const refundedOrders = orders.filter((o) => o.paymentStatus === 'refunded');
  const refundedAmount = refundedOrders.reduce((sum, o) => sum + (o.refund?.amount || 0), 0);

  const byPaymentMethod = {};
  for (const order of orders) {
    const key = order.paymentMethod || 'unknown';
    if (!byPaymentMethod[key]) byPaymentMethod[key] = { captured: 0, refunded: 0, orders: 0 };
    byPaymentMethod[key].captured += order.pricing.grandTotal;
    byPaymentMethod[key].orders += 1;
    if (order.paymentStatus === 'refunded') byPaymentMethod[key].refunded += order.refund?.amount || 0;
  }

  return {
    ordersCount: orders.length,
    capturedAmount,
    refundsCount: refundedOrders.length,
    refundedAmount,
    netAmount: capturedAmount - refundedAmount,
    byPaymentMethod,
    orders,
  };
}

async function getSalesReportData({ startDate, endDate }) {
  const filter = { status: { $in: CONFIRMED_STATUSES }, ...dateRangeFilter('confirmedAt', startDate, endDate) };
  const orders = await Order.find(filter).sort({ confirmedAt: -1 }).lean();

  const totalItemsSold = orders.reduce(
    (sum, o) => sum + o.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );
  const totalRevenue = orders.reduce((sum, o) => sum + o.pricing.grandTotal, 0);

  return { orders, orderCount: orders.length, totalItemsSold, totalRevenue };
}

async function getRevenueReportData({ startDate, endDate }) {
  const filter = { status: { $in: CONFIRMED_STATUSES }, ...dateRangeFilter('confirmedAt', startDate, endDate) };

  const byPaymentMethod = await Order.aggregate([
    { $match: filter },
    { $group: { _id: '$paymentMethod', revenue: { $sum: '$pricing.grandTotal' }, orders: { $sum: 1 } } },
  ]);

  const byDay = await Order.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$confirmedAt' } },
        revenue: { $sum: '$pricing.grandTotal' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const totalRevenue = byPaymentMethod.reduce((sum, row) => sum + row.revenue, 0);

  return { byPaymentMethod, byDay, totalRevenue };
}

async function getCustomerReportData({ startDate, endDate }) {
  const newCustomersFilter = dateRangeFilter('createdAt', startDate, endDate);
  const [totalCustomers, newCustomers] = await Promise.all([
    Customer.countDocuments({}),
    Customer.countDocuments(newCustomersFilter),
  ]);

  const topCustomers = await Order.aggregate([
    { $match: { status: { $in: CONFIRMED_STATUSES } } },
    { $group: { _id: '$customerId', orderCount: { $sum: 1 }, totalSpent: { $sum: '$pricing.grandTotal' } } },
    { $sort: { totalSpent: -1 } },
    { $limit: 20 },
    { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
    { $unwind: '$customer' },
    { $project: { name: '$customer.name', email: '$customer.email', orderCount: 1, totalSpent: 1 } },
  ]);

  return { totalCustomers, newCustomers, topCustomers };
}

async function getInventoryReportData() {
  const products = await Product.find({ status: { $ne: 'archived' } })
    .select('name variants')
    .lean();

  const rows = products.flatMap((product) =>
    product.variants.map((variant) => ({
      productName: product.name,
      sku: variant.sku,
      stock: variant.stock,
      lowStock: variant.stock < 10,
    }))
  );

  return { rows, lowStockCount: rows.filter((r) => r.lowStock).length, totalVariants: rows.length };
}

/**
 * Summary-level analytics until the dedicated analytics event/rollup
 * pipeline exists (a later phase) — built entirely from real order data
 * already being tracked, not placeholder numbers.
 */
async function getAnalyticsReportData({ startDate, endDate }) {
  const [sales, revenue, customers] = await Promise.all([
    getSalesReportData({ startDate, endDate }),
    getRevenueReportData({ startDate, endDate }),
    getCustomerReportData({ startDate, endDate }),
  ]);

  const averageOrderValue = sales.orderCount > 0 ? sales.totalRevenue / sales.orderCount : 0;

  return {
    orderCount: sales.orderCount,
    totalRevenue: revenue.totalRevenue,
    averageOrderValue,
    totalCustomers: customers.totalCustomers,
    newCustomers: customers.newCustomers,
    byDay: revenue.byDay,
  };
}

module.exports = {
  getSalesReportData,
  getRevenueReportData,
  getCustomerReportData,
  getInventoryReportData,
  getAnalyticsReportData,
  getReconciliationReportData,
};
