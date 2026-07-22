const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const addressBodySchema = z.object({
  label: z.string().trim().max(30).optional(),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(8).max(15),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  pincode: z.string().trim().min(4).max(10),
  country: z.string().trim().max(2).optional(),
  isDefault: z.coerce.boolean().optional(),
});

const addressIdParamsSchema = z.object({ addressId: objectId });

module.exports = { addressBodySchema, addressIdParamsSchema };
