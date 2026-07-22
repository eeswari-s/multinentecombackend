const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/review.controller');
const {
  listReviewsQuerySchema,
  reviewIdParamsSchema,
  moderateReviewSchema,
} = require('../../../validators/review.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('reviews:moderate'));

router.get('/', validateRequest({ query: listReviewsQuerySchema }), controller.list);
router.patch(
  '/:id',
  validateRequest({ params: reviewIdParamsSchema, body: moderateReviewSchema }),
  controller.moderate
);

module.exports = router;
