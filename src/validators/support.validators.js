const { z } = require('zod');
const { ENQUIRY_TYPES, ENQUIRY_STATUSES } = require('../models/supportEnquiry.model');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createEnquirySchema = z.object({
  type: z.enum(ENQUIRY_TYPES),
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email(),
  phone: z.string().trim().max(20).optional(),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(5000),
  productId: objectId.optional(),
  quantity: z.coerce.number().int().min(1).optional(),
});

const listEnquiriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(ENQUIRY_TYPES).optional(),
  status: z.enum(ENQUIRY_STATUSES).optional(),
});

const enquiryIdParamsSchema = z.object({ id: objectId });

const replyEnquirySchema = z.object({
  adminReply: z.string().trim().min(1).max(5000),
});

module.exports = { createEnquirySchema, listEnquiriesQuerySchema, enquiryIdParamsSchema, replyEnquirySchema };
