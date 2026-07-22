const asyncHandler = require('../../utils/asyncHandler');
const webhookService = require('../../services/webhookService');

const handle = asyncHandler(async (req, res) => {
  const result = await webhookService.handleRazorpayWebhook({
    rawBody: req.body, // Buffer — mounted with express.raw() ahead of the JSON parser
    signatureHeader: req.headers['x-razorpay-signature'],
  });

  if (!result.signatureValid) return res.status(400).json({ received: false });
  if (!result.processed) return res.status(500).json({ received: false });
  return res.status(200).json({ received: true });
});

module.exports = { handle };
