const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const orderIdParamsSchema = z.object({ id: objectId });
const documentIdParamsSchema = z.object({ id: objectId });
const reportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

module.exports = { orderIdParamsSchema, documentIdParamsSchema, reportQuerySchema };
