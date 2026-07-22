const { brandedLayout, formatDate } = require('./layout');

function deliveryChallanTemplate({ tenant, order }) {
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
    <h1>Delivery Challan</h1>
    <p style="font-size:11px;color:#666;">This document is issued for the transportation of goods and is not a tax invoice.</p>
    <table class="totals" style="margin-bottom: 24px;">
      <tr><td><strong>Order No:</strong> ${order.orderNumber}</td><td><strong>Date:</strong> ${formatDate(order.confirmedAt || order.createdAt)}</td></tr>
    </table>

    <table class="totals" style="margin-bottom: 24px;">
      <tr><td><strong>Deliver To:</strong></td></tr>
      <tr><td>${order.shippingAddress?.name || ''}</td></tr>
      <tr><td>${order.shippingAddress?.line1 || ''} ${order.shippingAddress?.line2 || ''}</td></tr>
      <tr><td>${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} ${order.shippingAddress?.pincode || ''}</td></tr>
      <tr><td>${order.shippingAddress?.phone || ''}</td></tr>
    </table>

    <table>
      <thead><tr><th>Item</th><th>SKU</th><th class="text-right">Qty</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <table class="totals" style="margin-top: 48px;">
      <tr><td style="width:50%;">Receiver's Signature: ____________________</td><td>Date: ____________________</td></tr>
    </table>
  `;

  return brandedLayout({ tenant, title: `Delivery Challan ${order.orderNumber}`, bodyHtml });
}

module.exports = { deliveryChallanTemplate };
