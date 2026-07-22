const { z } = require('zod');

const updatePlatformSettingsSchema = z.object({
  maintenanceMode: z
    .object({
      enabled: z.boolean().optional(),
      message: z.string().trim().max(500).optional(),
    })
    .optional(),
  defaultTrialDays: z.coerce.number().int().min(0).max(365).optional(),
  subscriptionGraceDays: z.coerce.number().int().min(0).max(90).optional(),
  abandonedCartThresholdHours: z.coerce.number().int().min(1).max(720).optional(),
  defaultCurrency: z.string().trim().length(3).optional(),
  supportEmail: z.string().trim().email().optional(),
  supportPhone: z.string().trim().max(20).optional(),
});

module.exports = { updatePlatformSettingsSchema };
