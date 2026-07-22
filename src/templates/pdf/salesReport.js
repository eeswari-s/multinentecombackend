const { brandedLayout, money, formatDate } = require('./layout');

function salesReportTemplate({ tenant, data, startDate, endDate }) {
  const rows = data.orders
    .map(
      (order) => `<tr>
        <td>${order.orderNumber || order._id}</td>
        <td>${formatDate(order.confirmedAt || order.createdAt)}</td>
        <td>${order.status}</td>
        <td>${order.paymentMethod || ''}</td>
        <td class="text-right">${money(order.pricing.grandTotal)}</td>
      </tr>`
    )
    .join('');

  const bodyHtml = `
    <h1>Sales Report</h1>
    <p style="font-size:12px;color:#666;">${startDate ? formatDate(startDate) : 'All time'} — ${endDate ? formatDate(endDate) : 'present'}</p>

    <table class="totals" style="width:400px;margin-bottom:24px;">
      <tr><td>Total Orders</td><td class="text-right">${data.orderCount}</td></tr>
      <tr><td>Total Items Sold</td><td class="text-right">${data.totalItemsSold}</td></tr>
      <tr><td><strong>Total Revenue</strong></td><td class="text-right"><strong>${money(data.totalRevenue)}</strong></td></tr>
    </table>

    <table>
      <thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Payment</th><th class="text-right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return brandedLayout({ tenant, title: 'Sales Report', bodyHtml });
}

module.exports = { salesReportTemplate };
