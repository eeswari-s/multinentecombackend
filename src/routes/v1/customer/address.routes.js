const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/address.controller');
const { addressBodySchema, addressIdParamsSchema } = require('../../../validators/address.validators');

const router = Router();

router.use(resolveTenantFromDomain, authenticate, requirePersona('customer'));

router.get('/', controller.list);
router.post('/', validateRequest({ body: addressBodySchema }), controller.create);
router.patch('/:addressId', validateRequest({ params: addressIdParamsSchema, body: addressBodySchema.partial() }), controller.update);
router.delete('/:addressId', validateRequest({ params: addressIdParamsSchema }), controller.remove);
router.post('/:addressId/default', validateRequest({ params: addressIdParamsSchema }), controller.setDefault);

module.exports = router;
