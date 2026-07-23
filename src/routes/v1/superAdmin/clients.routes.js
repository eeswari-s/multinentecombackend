const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requireRole } = require('../../../middlewares/rbac');
const controller = require('../../../controllers/superAdmin/clients.controller');
const subscriptionsController = require('../../../controllers/superAdmin/subscriptions.controller');
const featureFlagsController = require('../../../controllers/superAdmin/featureFlags.controller');
const {
  createClientSchema,
  updateClientSchema,
  resetOwnerPasswordSchema,
  setClientStatusSchema,
  listClientsQuerySchema,
  clientIdParamsSchema,
  assignPlanSchema,
  changeSubscriptionStatusSchema,
  extendTrialSchema,
  setFeatureFlagsSchema,
} = require('../../../validators/superAdmin.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), requireRole('super_admin'));

router.post('/', validateRequest({ body: createClientSchema }), controller.create);
router.get('/', validateRequest({ query: listClientsQuerySchema }), controller.list);
router.get('/:tenantId', validateRequest({ params: clientIdParamsSchema }), controller.getOne);
router.patch(
  '/:tenantId',
  validateRequest({ params: clientIdParamsSchema, body: updateClientSchema }),
  controller.update
);
router.patch(
  '/:tenantId/status',
  validateRequest({ params: clientIdParamsSchema, body: setClientStatusSchema }),
  controller.setStatus
);
router.post(
  '/:tenantId/reset-owner-password',
  validateRequest({ params: clientIdParamsSchema, body: resetOwnerPasswordSchema }),
  controller.resetOwnerPassword
);
router.post('/:tenantId/login-as', validateRequest({ params: clientIdParamsSchema }), controller.loginAs);

router.post(
  '/:tenantId/subscription/plan',
  validateRequest({ params: clientIdParamsSchema, body: assignPlanSchema }),
  subscriptionsController.assignPlan
);
router.patch(
  '/:tenantId/subscription/status',
  validateRequest({ params: clientIdParamsSchema, body: changeSubscriptionStatusSchema }),
  subscriptionsController.changeStatus
);
router.post(
  '/:tenantId/subscription/extend-trial',
  validateRequest({ params: clientIdParamsSchema, body: extendTrialSchema }),
  subscriptionsController.extendTrial
);

router.get(
  '/:tenantId/feature-flags',
  validateRequest({ params: clientIdParamsSchema }),
  featureFlagsController.getFlags
);
router.patch(
  '/:tenantId/feature-flags',
  validateRequest({ params: clientIdParamsSchema, body: setFeatureFlagsSchema }),
  featureFlagsController.setFlags
);

module.exports = router;
