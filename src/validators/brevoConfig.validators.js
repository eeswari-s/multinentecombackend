const { z } = require('zod');

const saveBrevoConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  senderName: z.string().trim().min(1).max(70),
  senderEmail: z.string().trim().toLowerCase().email(),
});

module.exports = { saveBrevoConfigSchema };
