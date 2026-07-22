const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const requestContext = require('../../utils/requestContext');
const { enqueueAnalyticsEvents } = require('../../jobs/queues/analyticsIngestion.queue');
const customerHistoryService = require('../../services/customer/customerHistoryService');

/**
 * Public (optional auth) — most tracked events (product views, searches)
 * happen before or without a customer ever authenticating. Session-scoped
 * via the client-supplied sessionId; customerId is additionally attached
 * whenever a valid customer access token is present, so recently-viewed/
 * recently-searched history can later be retrieved per-customer.
 */
const track = asyncHandler(async (req, res) => {
  const customerId = req.auth?.persona === 'customer' ? req.auth.userId : null;
  await enqueueAnalyticsEvents({
    tenantId: requestContext.getTenantId(),
    customerId,
    events: req.body.events,
  });
  sendSuccess(res, { statusCode: 202, message: 'Events queued' });
});

const recentlyViewed = asyncHandler(async (req, res) => {
  const products = await customerHistoryService.getRecentlyViewedProducts(req.auth.userId);
  sendSuccess(res, { data: products });
});

const recentSearches = asyncHandler(async (req, res) => {
  const queries = await customerHistoryService.getRecentSearches(req.auth.userId);
  sendSuccess(res, { data: queries });
});

module.exports = { track, recentlyViewed, recentSearches };
