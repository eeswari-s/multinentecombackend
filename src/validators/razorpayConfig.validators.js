const { z } = require('zod');

const saveRazorpayConfigSchema = z.object({
  keyId: z.string().trim().min(1),
  keySecret: z.string().trim().min(1),
  webhookSecret: z.string().trim().min(1),
});

module.exports = { saveRazorpayConfigSchema };
