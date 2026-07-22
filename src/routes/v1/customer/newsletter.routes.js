const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/newsletter.controller');
const { subscribeSchema } = require('../../../validators/newsletter.validators');

const router = Router();

router.use(resolveTenantFromDomain);

router.post('/subscribe', validateRequest({ body: subscribeSchema }), controller.subscribe);
router.post('/unsubscribe', validateRequest({ body: subscribeSchema }), controller.unsubscribe);

module.exports = router;
