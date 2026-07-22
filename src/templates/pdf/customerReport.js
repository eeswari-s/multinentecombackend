const { brandedLayout, money } = require('./layout');

function customerReportTemplate({ tenant, data }) {
  const rows = data.topCustomers
    .map(
      (c) =>
        `<tr><td>${c.name}</td><td>${c.email}</td><td class="text-right">${c.orderCount}</td><td class="text-right">${money(c.totalSpent)}</td></tr>`
    )
    .join('');

  const bodyHtml = `
    <h1>Customer Report</h1>

    <table class="totals" style="width:400px;margin-bottom:24px;">
      <tr><td>Total Customers</td><td class="text-right">${data.totalCustomers}</td></tr>
      <tr><td>New Customers (in range)</td><td class="text-right">${data.newCustomers}</td></tr>
    </table>

    <h2 style="font-size:14px;">Top Customers by Spend</h2>
    <table>
      <thead><tr><th>Name</th><th>Email</th><th class="text-right">Orders</th><th class="text-right">Total Spent</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return brandedLayout({ tenant, title: 'Customer Report', bodyHtml });
}

module.exports = { customerReportTemplate };
