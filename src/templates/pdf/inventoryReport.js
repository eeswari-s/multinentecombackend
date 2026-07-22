const { brandedLayout } = require('./layout');

function inventoryReportTemplate({ tenant, data }) {
  const rows = data.rows
    .map(
      (row) =>
        `<tr><td>${row.productName}</td><td>${row.sku}</td><td class="text-right">${row.stock}</td><td>${row.lowStock ? '<strong style="color:#c0392b;">Low stock</strong>' : 'OK'}</td></tr>`
    )
    .join('');

  const bodyHtml = `
    <h1>Inventory Report</h1>

    <table class="totals" style="width:400px;margin-bottom:24px;">
      <tr><td>Total Variants</td><td class="text-right">${data.totalVariants}</td></tr>
      <tr><td>Low Stock Variants (&lt; 10)</td><td class="text-right">${data.lowStockCount}</td></tr>
    </table>

    <table>
      <thead><tr><th>Product</th><th>SKU</th><th class="text-right">Stock</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return brandedLayout({ tenant, title: 'Inventory Report', bodyHtml });
}

module.exports = { inventoryReportTemplate };
