const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/backInStock.controller');
const { subscribeSchema, unsubscribeQuerySchema } = require('../../../validators/backInStock.validators');

const router = Router();

router.use(resolveTenantFromDomain, authenticate, requirePersona('customer'));

router.get('/', controller.list);
router.post('/', validateRequest({ body: subscribeSchema }), controller.subscribe);
router.delete('/', validateRequest({ query: unsubscribeQuerySchema }), controller.unsubscribe);

module.exports = router;
