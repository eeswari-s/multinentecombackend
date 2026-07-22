const { brandedLayout, formatDate } = require('./layout');

function packingSlipTemplate({ tenant, order }) {
  const rows = order.items
    .map(
      (item) => `<tr>
        <td>${item.name}</td>
        <td>${item.variantSku}</td>
        <td class="text-right">${item.quantity}</td>
      </tr>`
    )
    .join('');

  const bodyHtml = `
    <h1>Packing Slip</h1>
    <table class="totals" style="margin-bottom: 24px;">
      <tr><td><strong>Order No:</strong> ${order.orderNumber}</td><td><strong>Date:</strong> ${formatDate(order.confirmedAt || order.createdAt)}</td></tr>
    </table>

    <table class="totals" style="margin-bottom: 24px;">
      <tr><td><strong>Ship To:</strong></td></tr>
      <tr><td>${order.shippingAddress?.name || ''}</td></tr>
      <tr><td>${order.shippingAddress?.line1 || ''} ${order.shippingAddress?.line2 || ''}</td></tr>
      <tr><td>${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} ${order.shippingAddress?.pincode || ''}</td></tr>
      <tr><td>${order.shippingAddress?.phone || ''}</td></tr>
    </table>

    <table>
      <thead><tr><th>Item</th><th>SKU</th><th class="text-right">Qty</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return brandedLayout({ tenant, title: `Packing Slip ${order.orderNumber}`, bodyHtml });
}

module.exports = { packingSlipTemplate };
