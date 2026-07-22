const Razorpay = require('razorpay');
const { RazorpayConfig } = require('../../models/razorpayConfig.model');
const { decrypt } = require('../../utils/encryption');
const ApiError = require('../../utils/ApiError');

/**
 * Flow B: builds a Razorpay SDK client scoped to the CURRENT tenant's own
 * account (resolved via AsyncLocalStorage tenant context, same as any other
 * tenant-scoped query). Credentials are decrypted only here, at the point
 * of use — never logged, never returned from any endpoint.
 */
async function getTenantRazorpayClient() {
  const config = await RazorpayConfig.findOne({ isActive: true });
  if (!config) throw ApiError.badRequest('This store has not configured Razorpay yet');

  return new Razorpay({
    key_id: decrypt(config.encryptedKeyId),
    key_secret: decrypt(config.encryptedKeySecret),
  });
}

/**
 * Looked up by webhook handling, which resolves tenant via the URL path
 * (not domain/JWT — Razorpay calls this server-to-server) but still needs
 * that same tenant's own webhook secret to verify the signature.
 */
async function getTenantWebhookSecret() {
  const config = await RazorpayConfig.findOne({ isActive: true });
  if (!config) return null;
  return decrypt(config.encryptedWebhookSecret);
}

module.exports = { getTenantRazorpayClient, getTenantWebhookSecret };
