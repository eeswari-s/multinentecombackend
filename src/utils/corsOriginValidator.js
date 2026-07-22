const env = require('../config/env');

/**
 * Storefronts live on tenant subdomains/custom domains that aren't known at
 * boot time, so a static allowlist isn't enough. The tenant module (Phase 2)
 * registers `setCustomDomainChecker` with a Redis-backed lookup against the
 * `tenants` collection's domain mapping; until then custom domains beyond the
 * base-domain pattern are rejected (fail closed).
 */
let customDomainChecker = async () => false;

function setCustomDomainChecker(fn) {
  customDomainChecker = fn;
}

const explicitOrigins = new Set(env.cors.origins);
const subdomainPattern = new RegExp(`^https?:\\/\\/[a-z0-9-]+\\.${escapeRegex(env.baseDomain)}$`, 'i');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function isOriginAllowed(origin) {
  if (!origin) return true; // non-browser requests (curl, server-to-server, webhooks)
  if (explicitOrigins.has(origin)) return true;
  if (subdomainPattern.test(origin)) return true;
  return customDomainChecker(origin);
}

module.exports = { isOriginAllowed, setCustomDomainChecker };
