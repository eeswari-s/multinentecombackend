const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const requestContext = require('../../utils/requestContext');
const productService = require('../../services/customer/productService');
const { enqueueAnalyticsEvents } = require('../../jobs/queues/analyticsIngestion.queue');

const list = asyncHandler(async (req, res) => {
  const result = await productService.listProducts(req.query);
  sendSuccess(res, { data: result });
});

const searchSuggestions = asyncHandler(async (req, res) => {
  const suggestions = await productService.searchSuggestions(req.query.q);
  sendSuccess(res, { data: suggestions });
});

const getBySlug = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug);
  const similar = await productService.getSimilarProducts(product);
  sendSuccess(res, { data: { product, similar } });
});

const share = asyncHandler(async (req, res) => {
  const customerId = req.auth?.persona === 'customer' ? req.auth.userId : null;
  await enqueueAnalyticsEvents({
    tenantId: requestContext.getTenantId(),
    customerId,
    events: [{ type: 'product_share', productId: req.body.productId, sessionId: req.body.sessionId }],
  });
  sendSuccess(res, { statusCode: 202, message: 'Share tracked' });
});

const listCategories = asyncHandler(async (req, res) => {
  const categories = await productService.listCategories();
  sendSuccess(res, { data: categories });
});

module.exports = { list, searchSuggestions, getBySlug, share, listCategories };
