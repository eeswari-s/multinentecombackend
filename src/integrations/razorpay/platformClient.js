const Razorpay = require('razorpay');
const env = require('../../config/env');

/**
 * Flow A: the SaaS owner's OWN Razorpay account, used ONLY for charging
 * tenants their subscription fees (trial conversion, renewals, upgrades).
 * Never used for storefront checkout — that's Flow B (tenantClient.js),
 * scoped to each tenant's own encrypted credentials.
 */
let client;

function getPlatformRazorpayClient() {
  if (!client) {
    client = new Razorpay({
      key_id: env.razorpay.platformKeyId,
      key_secret: env.razorpay.platformKeySecret,
    });
  }
  return client;
}

module.exports = { getPlatformRazorpayClient };
