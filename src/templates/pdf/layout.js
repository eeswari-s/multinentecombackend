function money(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Every generated PDF shares this branded shell: tenant logo, name, GST
 * number, and brand color, so a document is visually distinct per client
 * with zero per-client code (section 6).
 */
function brandedLayout({ tenant, title, bodyHtml }) {
  const brandColor = tenant?.branding?.brandColor || '#111111';
  const logoHtml = tenant?.branding?.logoUrl
    ? `<img src="${tenant.branding.logoUrl}" alt="logo" style="height:48px;object-fit:contain;" />`
    : `<div style="font-size:20px;font-weight:bold;color:${brandColor};">${tenant?.businessName || 'Store'}</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 13px; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${brandColor}; padding-bottom: 16px; margin-bottom: 24px; }
  .header .meta { text-align: right; font-size: 12px; color: #555; }
  h1 { font-size: 20px; color: ${brandColor}; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: ${brandColor}; color: #fff; text-align: left; padding: 8px; font-size: 12px; }
  td { padding: 8px; border-bottom: 1px solid #eee; font-size: 12px; }
  .totals td { border: none; }
  .text-right { text-align: right; }
  .footer { margin-top: 32px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
</style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <div class="meta">
      <div><strong>${tenant?.businessName || ''}</strong></div>
      ${tenant?.gst?.number ? `<div>GSTIN: ${tenant.gst.number}</div>` : ''}
      ${tenant?.contactEmail ? `<div>${tenant.contactEmail}</div>` : ''}
    </div>
  </div>
  ${bodyHtml}
  <div class="footer">Generated on ${formatDate(new Date())} by ${tenant?.businessName || 'the store'}.</div>
</body>
</html>`;
}

module.exports = { brandedLayout, money, formatDate };
