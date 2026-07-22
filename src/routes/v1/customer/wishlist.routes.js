const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/wishlist.controller');
const { addWishlistItemSchema, productIdParamsSchema } = require('../../../validators/wishlist.validators');

const router = Router();

router.use(resolveTenantFromDomain, authenticate, requirePersona('customer'));

router.get('/', controller.list);
router.post('/', validateRequest({ body: addWishlistItemSchema }), controller.add);
router.delete('/:productId', validateRequest({ params: productIdParamsSchema }), controller.remove);

module.exports = router;
