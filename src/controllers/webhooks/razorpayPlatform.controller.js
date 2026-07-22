const asyncHandler = require('../../utils/asyncHandler');
const platformWebhookService = require('../../services/platformWebhookService');

const handle = asyncHandler(async (req, res) => {
  const result = await platformWebhookService.handlePlatformRazorpayWebhook({
    rawBody: req.body,
    signatureHeader: req.headers['x-razorpay-signature'],
  });

  if (!result.signatureValid) return res.status(400).json({ received: false });
  if (!result.processed) return res.status(500).json({ received: false });
  return res.status(200).json({ received: true });
});

module.exports = { handle };
