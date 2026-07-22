function wrapper(storeName, bodyHtml) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 24px;">${storeName || 'Our Store'}</h2>
      ${bodyHtml}
      <p style="margin-top: 32px; font-size: 12px; color: #888;">
        This is an automated message from ${storeName || 'our store'}.
      </p>
    </div>
  `;
}

const templates = {
  otp: ({ storeName, code, purpose }) => ({
    subject: `Your verification code: ${code}`,
    html: wrapper(
      storeName,
      `<p>Your verification code for ${purpose || 'account verification'} is:</p>
       <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
       <p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`
    ),
  }),

  password_reset: ({ storeName, resetUrl }) => ({
    subject: 'Reset your password',
    html: wrapper(
      storeName,
      `<p>We received a request to reset your password.</p>
       <p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:4px;">Reset password</a></p>
       <p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>`
    ),
  }),

  order_confirmation: ({ storeName, orderNumber, items, grandTotal, customerName }) => ({
    subject: `Order confirmed — ${orderNumber}`,
    html: wrapper(
      storeName,
      `<p>Hi ${customerName || 'there'},</p>
       <p>Your order <strong>${orderNumber}</strong> has been confirmed.</p>
       <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
         <thead><tr><th style="text-align:left;border-bottom:1px solid #ddd;padding:8px 0;">Item</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:8px 0;">Qty</th></tr></thead>
         <tbody>
           ${(items || [])
             .map(
               (item) =>
                 `<tr><td style="padding:6px 0;">${item.name}</td><td style="text-align:right;padding:6px 0;">${item.quantity}</td></tr>`
             )
             .join('')}
         </tbody>
       </table>
       <p style="font-weight:bold;">Total: ₹${(grandTotal || 0).toFixed(2)}</p>`
    ),
  }),

  invoice: ({ storeName, orderNumber, invoiceNumber }) => ({
    subject: `Invoice ${invoiceNumber} for order ${orderNumber}`,
    html: wrapper(
      storeName,
      `<p>Please find attached the invoice <strong>${invoiceNumber}</strong> for your order <strong>${orderNumber}</strong>.</p>`
    ),
  }),

  shipping_update: ({ storeName, orderNumber, status, trackingUrl }) => ({
    subject: `Your order ${orderNumber} is ${status}`,
    html: wrapper(
      storeName,
      `<p>Your order <strong>${orderNumber}</strong> is now <strong>${status}</strong>.</p>
       ${trackingUrl ? `<p><a href="${trackingUrl}">Track your shipment</a></p>` : ''}`
    ),
  }),

  newsletter: ({ storeName, subject, bodyHtml }) => ({
    subject,
    html: wrapper(storeName, bodyHtml),
  }),

  abandoned_cart: ({ storeName, customerName, items }) => ({
    subject: 'You left something in your cart',
    html: wrapper(
      storeName,
      `<p>Hi ${customerName || 'there'},</p>
       <p>You still have items waiting in your cart at ${storeName || 'our store'}:</p>
       <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
         <tbody>
           ${(items || [])
             .map(
               (item) =>
                 `<tr><td style="padding:6px 0;">${item.name}</td><td style="text-align:right;padding:6px 0;">Qty ${item.quantity}</td></tr>`
             )
             .join('')}
         </tbody>
       </table>
       <p>Complete your purchase before they sell out.</p>`
    ),
  }),

  back_in_stock: ({ storeName, productName, productUrl }) => ({
    subject: `${productName} is back in stock`,
    html: wrapper(
      storeName,
      `<p>Good news — <strong>${productName}</strong> is back in stock.</p>
       ${productUrl ? `<p><a href="${productUrl}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:4px;">View product</a></p>` : ''}`
    ),
  }),

  subscription_renewal_reminder: ({ storeName, planName, dueDate }) => ({
    subject: `Your subscription renews on ${dueDate}`,
    html: wrapper(
      storeName,
      `<p>Your <strong>${planName || 'subscription'}</strong> plan is due for renewal on <strong>${dueDate}</strong>.</p>
       <p>Please make sure your payment method is up to date to avoid any interruption to your store.</p>`
    ),
  }),

  subscription_grace_period_started: ({ storeName, graceDays, gracePeriodEndsAt }) => ({
    subject: 'Action needed: your subscription has lapsed',
    html: wrapper(
      storeName,
      `<p>Your subscription period has ended. Your storefront still has full access for the next <strong>${graceDays} day(s)</strong> (until <strong>${gracePeriodEndsAt}</strong>) while you renew.</p>
       <p>After that, new orders will be paused until payment is received.</p>`
    ),
  }),

  subscription_read_only: ({ storeName }) => ({
    subject: 'Your store is no longer accepting new orders',
    html: wrapper(
      storeName,
      `<p>Your subscription's grace period has ended. <strong>${storeName || 'Your store'}</strong> can no longer accept new orders until payment is received.</p>
       <p>Your storefront and admin panel remain accessible so you can renew at any time.</p>`
    ),
  }),

  subscription_payment_failed: ({ storeName, planName, failureReason }) => ({
    subject: 'Your subscription payment failed',
    html: wrapper(
      storeName,
      `<p>We were unable to process payment for your <strong>${planName || 'subscription'}</strong> plan.</p>
       ${failureReason ? `<p>Reason: ${failureReason}</p>` : ''}
       <p>Please retry your payment to avoid any interruption to your store.</p>`
    ),
  }),
};

function renderEmail(type, data) {
  const builder = templates[type];
  if (!builder) throw new Error(`Unknown email type "${type}"`);
  return builder(data);
}

module.exports = { renderEmail };
