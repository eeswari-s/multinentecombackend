const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redisClient } = require('../config/redis');
const requestContext = require('../utils/requestContext');
const ApiError = require('../utils/ApiError');

// ioredis-mock (used across the test suite in place of real Redis) does not
// implement the generic `.call()` command dispatch RedisStore needs, only
// its typed methods — the same class of gap that ruled out ioredis-mock for
// BullMQ elsewhere in this codebase. Rather than mocking rate-limit-redis
// project-wide, fall back to express-rate-limit's built-in in-memory store
// when `.call` isn't available; this keeps rate limiting itself under real
// test coverage while sidestepping the one incompatible primitive. In
// production this is always Redis-backed, which is required correctness
// once the API runs as more than one instance.
const canUseRedisStore = typeof redisClient.call === 'function';

function buildStore(prefix) {
  if (!canUseRedisStore) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args) => redisClient.call(...args),
  });
}

/**
 * Keys by tenant + client IP whenever a tenant has already been resolved
 * into the request context (every storefront/customer and Client Admin
 * route resolves tenant before this middleware runs). Falls back to IP-only
 * keying for routes with no tenant concept (Super Admin, the public /ping
 * route) — one tenant's traffic can never exhaust another tenant's quota,
 * and a Super Admin brute-force attempt can't hide behind tenant keying.
 */
function tenantAwareKeyGenerator(req) {
  const tenantId = requestContext.getTenantId();
  const ip = ipKeyGenerator(req.ip);
  return tenantId ? `tenant:${tenantId}:${ip}` : `ip:${ip}`;
}

function rateLimitHandler(req, res, next, options) {
  next(ApiError.tooManyRequests('Too many requests. Please try again later.'));
}

/**
 * General-purpose API limiter: generous enough not to bother real traffic,
 * present to blunt scraping/abuse. Mounted globally in app.js.
 */
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: tenantAwareKeyGenerator,
  handler: rateLimitHandler,
  store: buildStore('api'),
});

/**
 * Strict limiter for credential-guessing-prone endpoints (login, register,
 * OTP resend, forgot/reset password) across both the customer and Client
 * Admin auth routers. Mounted per-route, AFTER tenant resolution, so it is
 * always genuinely tenant-scoped for those two personas.
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: tenantAwareKeyGenerator,
  handler: rateLimitHandler,
  store: buildStore('auth'),
});

/**
 * Super Admin auth has no tenant concept — keyed by IP alone, and stricter
 * still since a compromised Super Admin account is a platform-wide breach.
 */
const superAdminAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
  handler: rateLimitHandler,
  store: buildStore('super-admin-auth'),
});

module.exports = { apiRateLimiter, authRateLimiter, superAdminAuthRateLimiter };
