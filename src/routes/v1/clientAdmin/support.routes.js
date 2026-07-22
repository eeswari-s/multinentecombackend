const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/support.controller');
const {
  listEnquiriesQuerySchema,
  enquiryIdParamsSchema,
  replyEnquirySchema,
} = require('../../../validators/support.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('support:manage'));

router.get('/enquiries', validateRequest({ query: listEnquiriesQuerySchema }), controller.list);
router.patch(
  '/enquiries/:id/reply',
  validateRequest({ params: enquiryIdParamsSchema, body: replyEnquirySchema }),
  controller.reply
);

module.exports = router;
