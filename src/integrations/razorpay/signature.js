const crypto = require('crypto');

function hmacHexEqual(payload, secret, providedHex) {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(providedHex || '', 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function verifyWebhookSignature(rawBody, signature, secret) {
  return hmacHexEqual(rawBody, secret, signature);
}

function verifyPaymentSignature({ orderId, paymentId, signature, keySecret }) {
  return hmacHexEqual(`${orderId}|${paymentId}`, keySecret, signature);
}

module.exports = { verifyWebhookSignature, verifyPaymentSignature };
