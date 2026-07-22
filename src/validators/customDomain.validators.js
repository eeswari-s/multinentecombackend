const { z } = require('zod');

const setCustomDomainSchema = z.object({
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/, 'Invalid domain name'),
});

module.exports = { setCustomDomainSchema };
