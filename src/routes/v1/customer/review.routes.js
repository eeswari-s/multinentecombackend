const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/review.controller');
const {
  createReviewSchema,
  productIdParamsSchema,
} = require('../../../validators/review.validators');

const router = Router();

router.use(resolveTenantFromDomain);

router.get('/product/:productId', validateRequest({ params: productIdParamsSchema }), controller.listForProduct);
router.post('/', authenticate, requirePersona('customer'), validateRequest({ body: createReviewSchema }), controller.create);
router.get('/mine', authenticate, requirePersona('customer'), controller.listMine);

module.exports = router;
