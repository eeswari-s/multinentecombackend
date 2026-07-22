const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const requestContext = require('../utils/requestContext');
const tenantService = require('../services/tenantService');

function assertTenantAccessible(tenant) {
  if (!tenant || tenant.status === 'deleted') {
    throw ApiError.notFound('Store not found');
  }
  if (tenant.status === 'suspended') {
    throw ApiError.forbidden('This store has been suspended');
  }
}

function applyTenantToContext(tenant) {
  requestContext.set('tenantId', String(tenant._id));
  requestContext.set('tenant', tenant);
}

/**
 * Storefront/customer-facing requests: resolve tenant from subdomain or
 * mapped custom domain. Must run before any route logic that touches
 * tenant-scoped data, and does NOT require authentication.
 */
const resolveTenantFromDomain = asyncHandler(async (req, res, next) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const tenant = await tenantService.getTenantByHost(host);
  assertTenantAccessible(tenant);
  applyTenantToContext(tenant);
  next();
});

/**
 * Client Admin / authenticated requests: resolve tenant from the tenantId
 * claim embedded in the JWT access token. Must be mounted AFTER the
 * `authenticate` middleware (Phase 3), which sets req.auth = { userId,
 * tenantId, role }.
 */
const resolveTenantFromAuth = asyncHandler(async (req, res, next) => {
  if (!req.auth || !req.auth.tenantId) {
    throw ApiError.unauthorized('Access token is missing a tenant claim');
  }
  const tenant = await tenantService.getTenantById(req.auth.tenantId);
  assertTenantAccessible(tenant);
  applyTenantToContext(tenant);
  next();
});

/**
 * Webhooks (Razorpay) are called server-to-server with no Host header
 * matching a tenant domain and no JWT — the tenant identifier is embedded
 * directly in the webhook URL each tenant configured in their own Razorpay
 * dashboard (see routes/v1/webhooks). A third, narrowly-scoped resolution
 * path, distinct from the two documented in the architecture (section 3).
 */
function resolveTenantFromParam(paramName) {
  return asyncHandler(async (req, res, next) => {
    const tenant = await tenantService.getTenantById(req.params[paramName]);
    assertTenantAccessible(tenant);
    applyTenantToContext(tenant);
    next();
  });
}

module.exports = { resolveTenantFromDomain, resolveTenantFromAuth, resolveTenantFromParam };
