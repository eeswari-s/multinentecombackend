const { brandedLayout } = require('./layout');

function shippingLabelTemplate({ tenant, order }) {
  const totalWeightGrams = order.items.reduce((sum, item) => sum + (item.weightGrams || 0) * item.quantity, 0);
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

  const bodyHtml = `
    <h1>Shipping Label</h1>
    <table class="totals" style="margin-bottom: 24px; border: 2px solid #000;">
      <tr><td style="padding: 12px;"><strong>FROM:</strong><br/>
        ${tenant?.businessName || ''}<br/>
        ${tenant?.address?.line1 || ''} ${tenant?.address?.line2 || ''}<br/>
        ${tenant?.address?.city || ''}, ${tenant?.address?.state || ''} ${tenant?.address?.pincode || ''}<br/>
        ${tenant?.contactPhone || ''}
      </td></tr>
    </table>

    <table class="totals" style="margin-bottom: 24px; border: 2px solid #000;">
      <tr><td style="padding: 12px; font-size: 16px;"><strong>TO:</strong><br/>
        <strong>${order.shippingAddress?.name || ''}</strong><br/>
        ${order.shippingAddress?.line1 || ''} ${order.shippingAddress?.line2 || ''}<br/>
        ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} ${order.shippingAddress?.pincode || ''}<br/>
        Phone: ${order.shippingAddress?.phone || ''}
      </td></tr>
    </table>

    <table class="totals">
      <tr><td><strong>Order No:</strong> ${order.orderNumber}</td></tr>
      <tr><td><strong>Items:</strong> ${totalItems}</td></tr>
      ${totalWeightGrams > 0 ? `<tr><td><strong>Total Weight:</strong> ${(totalWeightGrams / 1000).toFixed(2)} kg</td></tr>` : ''}
      <tr><td><strong>Payment:</strong> ${order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}</td></tr>
    </table>
  `;

  return brandedLayout({ tenant, title: `Shipping Label ${order.orderNumber}`, bodyHtml });
}

module.exports = { shippingLabelTemplate };
