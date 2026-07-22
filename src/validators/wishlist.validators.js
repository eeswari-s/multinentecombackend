const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const addWishlistItemSchema = z.object({ productId: objectId });
const productIdParamsSchema = z.object({ productId: objectId });

module.exports = { addWishlistItemSchema, productIdParamsSchema };
