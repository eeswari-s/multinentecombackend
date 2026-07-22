const { brandedLayout, money, formatDate } = require('./layout');

function revenueReportTemplate({ tenant, data, startDate, endDate }) {
  const byDayRows = data.byDay
    .map((row) => `<tr><td>${row._id}</td><td class="text-right">${row.orders}</td><td class="text-right">${money(row.revenue)}</td></tr>`)
    .join('');

  const byMethodRows = data.byPaymentMethod
    .map(
      (row) =>
        `<tr><td>${row._id || 'unknown'}</td><td class="text-right">${row.orders}</td><td class="text-right">${money(row.revenue)}</td></tr>`
    )
    .join('');

  const bodyHtml = `
    <h1>Revenue Report</h1>
    <p style="font-size:12px;color:#666;">${startDate ? formatDate(startDate) : 'All time'} — ${endDate ? formatDate(endDate) : 'present'}</p>

    <table class="totals" style="width:400px;margin-bottom:24px;">
      <tr><td><strong>Total Revenue</strong></td><td class="text-right"><strong>${money(data.totalRevenue)}</strong></td></tr>
    </table>

    <h2 style="font-size:14px;">By Payment Method</h2>
    <table>
      <thead><tr><th>Method</th><th class="text-right">Orders</th><th class="text-right">Revenue</th></tr></thead>
      <tbody>${byMethodRows}</tbody>
    </table>

    <h2 style="font-size:14px;">By Day</h2>
    <table>
      <thead><tr><th>Date</th><th class="text-right">Orders</th><th class="text-right">Revenue</th></tr></thead>
      <tbody>${byDayRows}</tbody>
    </table>
  `;

  return brandedLayout({ tenant, title: 'Revenue Report', bodyHtml });
}

module.exports = { revenueReportTemplate };
