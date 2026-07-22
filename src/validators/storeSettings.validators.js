const { z } = require('zod');

const updateBrandingSchema = z.object({
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'brandColor must be a hex color like #111111')
    .optional(),
});

const updateShippingSettingsSchema = z.object({
  flatRate: z.coerce.number().min(0).optional(),
  freeShippingThreshold: z.coerce.number().min(0).optional(),
});

module.exports = { updateBrandingSchema, updateShippingSettingsSchema };
