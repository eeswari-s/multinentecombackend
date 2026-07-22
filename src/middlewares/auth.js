const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const requestContext = require('../utils/requestContext');
const tokenService = require('../services/tokenService');

function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

/**
 * Verifies the access token and populates req.auth with its claims. Does
 * NOT check persona (admin vs customer) or tenant match by itself — pair
 * with `requirePersona` and, for Client Admin routes, tenantResolver's
 * resolveTenantFromAuth (which reads req.auth.tenantId).
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw ApiError.unauthorized('Missing bearer access token');
  }

  let claims;
  try {
    claims = tokenService.verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  req.auth = {
    userId: claims.sub,
    tenantId: claims.tenantId || null,
    role: claims.role,
    persona: claims.persona,
    deviceId: claims.deviceId,
    email: claims.email,
    impersonation: claims.impersonation || null,
  };

  requestContext.set('userId', req.auth.userId);
  requestContext.set('role', req.auth.role);

  next();
});

/**
 * For endpoints that behave for both guests and logged-in users (e.g.
 * analytics event tracking) — populates req.auth exactly like `authenticate`
 * when a valid bearer token is present, but never throws: a missing,
 * malformed, or expired token just means the request continues as a guest.
 */
const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const claims = tokenService.verifyAccessToken(token);
    req.auth = {
      userId: claims.sub,
      tenantId: claims.tenantId || null,
      role: claims.role,
      persona: claims.persona,
      deviceId: claims.deviceId,
      email: claims.email,
      impersonation: claims.impersonation || null,
    };
    requestContext.set('userId', req.auth.userId);
    requestContext.set('role', req.auth.role);
  } catch {
    // Invalid/expired token on an optional-auth route: proceed as a guest.
  }
  next();
});

function requirePersona(expectedPersona) {
  return function checkPersona(req, res, next) {
    if (!req.auth || req.auth.persona !== expectedPersona) {
      return next(ApiError.forbidden('This endpoint is not available for this account type'));
    }
    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, requirePersona };
