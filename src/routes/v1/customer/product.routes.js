const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { optionalAuthenticate } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/product.controller');
const {
  listProductsQuerySchema,
  searchSuggestionsQuerySchema,
  productSlugParamsSchema,
  shareProductSchema,
} = require('../../../validators/customerProduct.validators');

const router = Router();

router.use(resolveTenantFromDomain);

router.get('/', validateRequest({ query: listProductsQuerySchema }), controller.list);
router.get('/categories', controller.listCategories);
router.get('/search-suggestions', validateRequest({ query: searchSuggestionsQuerySchema }), controller.searchSuggestions);
router.post('/share', optionalAuthenticate, validateRequest({ body: shareProductSchema }), controller.share);
router.get('/:slug', validateRequest({ params: productSlugParamsSchema }), controller.getBySlug);

module.exports = router;
