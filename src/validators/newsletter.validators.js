const { z } = require('zod');

const subscribeSchema = z.object({ email: z.string().trim().email() });

const listSubscribersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

module.exports = { subscribeSchema, listSubscribersQuerySchema };
