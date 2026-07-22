const { Tenant } = require('../models/tenant.model');
const { redisClient } = require('../config/redis');
const env = require('../config/env');
const logger = require('../utils/logger');

const CACHE_TTL_SECONDS = 300;

const cacheKeyById = (id) => `tenant:id:${id}`;
const cacheKeyBySubdomain = (subdomain) => `tenant:subdomain:${subdomain}`;
const cacheKeyByCustomDomain = (domain) => `tenant:domain:${domain}`;

async function readCache(key) {
  try {
    const raw = await redisClient.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn('Tenant cache read failed, falling back to MongoDB', { error: err.message, key });
    return null;
  }
}

async function writeCache(key, tenant) {
  try {
    await redisClient.set(key, JSON.stringify(tenant), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn('Tenant cache write failed', { error: err.message, key });
  }
}

async function cacheTenant(tenant) {
  const jobs = [writeCache(cacheKeyById(String(tenant._id)), tenant)];
  if (tenant.domain?.subdomain) {
    jobs.push(writeCache(cacheKeyBySubdomain(tenant.domain.subdomain), tenant));
  }
  if (tenant.domain?.customDomain) {
    jobs.push(writeCache(cacheKeyByCustomDomain(tenant.domain.customDomain), tenant));
  }
  await Promise.all(jobs);
}

async function getTenantById(tenantId) {
  if (!tenantId) return null;

  const cached = await readCache(cacheKeyById(tenantId));
  if (cached) return cached;

  const tenant = await Tenant.findById(tenantId).lean();
  if (tenant) await cacheTenant(tenant);
  return tenant;
}

function extractSubdomain(hostname) {
  const suffix = `.${env.baseDomain}`;
  if (hostname.endsWith(suffix)) {
    return hostname.slice(0, -suffix.length);
  }
  return null;
}

async function getTenantByHost(rawHost) {
  if (!rawHost) return null;
  const hostname = rawHost.split(':')[0].toLowerCase();

  const subdomain = extractSubdomain(hostname);

  if (!subdomain) {
    const cached = await readCache(cacheKeyByCustomDomain(hostname));
    if (cached) return cached;

    // Fails closed: an unverified customDomain never resolves to a tenant,
    // otherwise any Client Admin could claim a domain they don't control.
    const tenant = await Tenant.findOne({ 'domain.customDomain': hostname, 'domain.customDomainVerified': true }).lean();
    if (tenant) await cacheTenant(tenant);
    return tenant;
  }

  const cached = await readCache(cacheKeyBySubdomain(subdomain));
  if (cached) return cached;

  const tenant = await Tenant.findOne({ 'domain.subdomain': subdomain }).lean();
  if (tenant) await cacheTenant(tenant);
  return tenant;
}

async function invalidateTenantCache(tenant) {
  const keys = [cacheKeyById(String(tenant._id))];
  if (tenant.domain?.subdomain) keys.push(cacheKeyBySubdomain(tenant.domain.subdomain));
  if (tenant.domain?.customDomain) keys.push(cacheKeyByCustomDomain(tenant.domain.customDomain));

  try {
    await redisClient.del(...keys);
  } catch (err) {
    logger.warn('Tenant cache invalidation failed', { error: err.message, tenantId: String(tenant._id) });
  }
}

module.exports = {
  getTenantById,
  getTenantByHost,
  invalidateTenantCache,
};
