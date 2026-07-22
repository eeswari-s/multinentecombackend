const { brandedLayout, money, formatDate } = require('./layout');

function invoiceTemplate({ tenant, order }) {
  const rows = order.items
    .map(
      (item) => `<tr>
        <td>${item.name}</td>
        <td>${item.variantSku}</td>
        <td class="text-right">${item.quantity}</td>
        <td class="text-right">${money(item.unitPrice)}</td>
        <td class="text-right">${money(item.subtotal)}</td>
      </tr>`
    )
    .join('');

  const bodyHtml = `
    <h1>Tax Invoice</h1>
    <table class="totals" style="margin-bottom: 24px;">
      <tr><td><strong>Invoice No:</strong> ${order.invoiceNumber}</td><td><strong>Order No:</strong> ${order.orderNumber}</td></tr>
      <tr><td><strong>Date:</strong> ${formatDate(order.confirmedAt || order.createdAt)}</td><td><strong>Payment:</strong> ${order.paymentMethod?.toUpperCase()}</td></tr>
    </table>

    <table class="totals" style="margin-bottom: 24px;">
      <tr><td><strong>Bill To:</strong></td></tr>
      <tr><td>${order.shippingAddress?.name || ''}</td></tr>
      <tr><td>${order.shippingAddress?.line1 || ''} ${order.shippingAddress?.line2 || ''}</td></tr>
      <tr><td>${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} ${order.shippingAddress?.pincode || ''}</td></tr>
      <tr><td>${order.shippingAddress?.phone || ''}</td></tr>
    </table>

    <table>
      <thead><tr><th>Item</th><th>SKU</th><th class="text-right">Qty</th><th class="text-right">Unit Price</th><th class="text-right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <table class="totals" style="width: 300px; margin-left: auto;">
      <tr><td>Items Total</td><td class="text-right">${money(order.pricing.itemsTotal)}</td></tr>
      <tr><td>Shipping</td><td class="text-right">${money(order.pricing.shippingCharge)}</td></tr>
      ${
        order.pricing.igstAmount > 0
          ? `<tr><td>IGST</td><td class="text-right">${money(order.pricing.igstAmount)}</td></tr>`
          : order.pricing.cgstAmount > 0 || order.pricing.sgstAmount > 0
            ? `<tr><td>CGST</td><td class="text-right">${money(order.pricing.cgstAmount)}</td></tr>
               <tr><td>SGST</td><td class="text-right">${money(order.pricing.sgstAmount)}</td></tr>`
            : `<tr><td>GST</td><td class="text-right">${money(order.pricing.gstAmount)}</td></tr>`
      }
      <tr><td><strong>Grand Total</strong></td><td class="text-right"><strong>${money(order.pricing.grandTotal)}</strong></td></tr>
    </table>
  `;

  return brandedLayout({ tenant, title: `Invoice ${order.invoiceNumber}`, bodyHtml });
}

module.exports = { invoiceTemplate };
