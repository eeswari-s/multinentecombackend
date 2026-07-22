const { brandedLayout, money, formatDate } = require('./layout');

function analyticsReportTemplate({ tenant, data, startDate, endDate }) {
  const byDayRows = data.byDay
    .map((row) => `<tr><td>${row._id}</td><td class="text-right">${row.orders}</td><td class="text-right">${money(row.revenue)}</td></tr>`)
    .join('');

  const bodyHtml = `
    <h1>Analytics Summary</h1>
    <p style="font-size:12px;color:#666;">${startDate ? formatDate(startDate) : 'All time'} — ${endDate ? formatDate(endDate) : 'present'}</p>

    <table class="totals" style="width:400px;margin-bottom:24px;">
      <tr><td>Total Orders</td><td class="text-right">${data.orderCount}</td></tr>
      <tr><td>Total Revenue</td><td class="text-right">${money(data.totalRevenue)}</td></tr>
      <tr><td>Average Order Value</td><td class="text-right">${money(data.averageOrderValue)}</td></tr>
      <tr><td>Total Customers</td><td class="text-right">${data.totalCustomers}</td></tr>
      <tr><td>New Customers</td><td class="text-right">${data.newCustomers}</td></tr>
    </table>

    <h2 style="font-size:14px;">Orders &amp; Revenue by Day</h2>
    <table>
      <thead><tr><th>Date</th><th class="text-right">Orders</th><th class="text-right">Revenue</th></tr></thead>
      <tbody>${byDayRows}</tbody>
    </table>
  `;

  return brandedLayout({ tenant, title: 'Analytics Report', bodyHtml });
}

module.exports = { analyticsReportTemplate };
