const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/offer.controller');
const { createOfferSchema, listOffersQuerySchema, offerIdParamsSchema } = require('../../../validators/offer.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth);

router.post('/', requirePermission('offers:write'), validateRequest({ body: createOfferSchema }), controller.create);
router.get('/', requirePermission('offers:read'), validateRequest({ query: listOffersQuerySchema }), controller.list);
router.patch(
  '/:id/deactivate',
  requirePermission('offers:write'),
  validateRequest({ params: offerIdParamsSchema }),
  controller.deactivate
);
router.delete(
  '/:id',
  requirePermission('offers:write'),
  validateRequest({ params: offerIdParamsSchema }),
  controller.remove
);

module.exports = router;
