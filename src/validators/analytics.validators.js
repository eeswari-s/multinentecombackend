const { z } = require('zod');
const { EVENT_TYPES } = require('../models/analyticsEvent.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  productId: objectId.optional(),
  sessionId: z.string().trim().min(1).max(100),
  device: z.enum(['mobile', 'desktop', 'tablet', 'unknown']).optional(),
  browser: z.string().trim().max(50).optional(),
  country: z.string().trim().max(50).optional(),
  trafficSource: z.string().trim().max(50).optional(),
  viewDurationMs: z.coerce.number().min(0).optional(),
  searchQuery: z.string().trim().max(200).optional(),
});

const trackEventsSchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

const analyticsQuerySchema = z.object({
  granularity: z.enum(['hourly', 'daily']).default('daily'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

module.exports = { trackEventsSchema, analyticsQuerySchema };
