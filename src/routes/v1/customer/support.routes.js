const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { optionalAuthenticate } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/support.controller');
const { createEnquirySchema } = require('../../../validators/support.validators');

const router = Router();

router.post(
  '/enquiries',
  resolveTenantFromDomain,
  optionalAuthenticate,
  validateRequest({ body: createEnquirySchema }),
  controller.create
);

module.exports = router;
