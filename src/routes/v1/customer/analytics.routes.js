const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const { authenticate, optionalAuthenticate, requirePersona } = require('../../../middlewares/auth');
const controller = require('../../../controllers/customer/analytics.controller');
const { trackEventsSchema } = require('../../../validators/analytics.validators');

const router = Router();

router.post(
  '/track',
  resolveTenantFromDomain,
  optionalAuthenticate,
  validateRequest({ body: trackEventsSchema }),
  controller.track
);
router.get('/recently-viewed', resolveTenantFromDomain, authenticate, requirePersona('customer'), controller.recentlyViewed);
router.get('/recent-searches', resolveTenantFromDomain, authenticate, requirePersona('customer'), controller.recentSearches);

module.exports = router;
