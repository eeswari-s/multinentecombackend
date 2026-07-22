const crypto = require('crypto');
const dns = require('dns').promises;
const { Tenant } = require('../../models/tenant.model');
const tenantService = require('../tenantService');
const requestContext = require('../../utils/requestContext');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

const VERIFICATION_SUBDOMAIN = '_platform-verify';

function verificationHostFor(domain) {
  return `${VERIFICATION_SUBDOMAIN}.${domain}`;
}

/**
 * Domain ownership verification via a DNS TXT record — the same
 * industry-standard pattern used by Vercel/Netlify/Cloudflare for SaaS.
 * TLS termination for a verified domain is left to whatever sits in front
 * of this backend at deploy time (reverse proxy / CDN) — not built here,
 * since that depends on infrastructure choices this backend has no
 * visibility into.
 */
async function setCustomDomain({ customDomain, actor }) {
  const tenantId = requestContext.getTenantId();
  const normalized = customDomain.toLowerCase().trim();

  const existing = await Tenant.findOne({ 'domain.customDomain': normalized, _id: { $ne: tenantId } });
  if (existing) throw ApiError.conflict('This domain is already in use by another store');

  const token = crypto.randomBytes(16).toString('hex');

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    {
      $set: {
        'domain.customDomain': normalized,
        'domain.customDomainVerified': false,
        'domain.customDomainVerificationToken': token,
      },
    },
    { returnDocument: 'after' }
  );
  await tenantService.invalidateTenantCache(tenant);

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'custom_domain.set',
    metadata: { customDomain: normalized },
  });

  return {
    customDomain: normalized,
    verified: false,
    verificationInstructions: {
      recordType: 'TXT',
      host: verificationHostFor(normalized),
      value: token,
    },
  };
}

async function verifyCustomDomain({ actor }) {
  const tenant = await Tenant.findById(requestContext.getTenantId());
  if (!tenant?.domain?.customDomain) {
    throw ApiError.badRequest('No custom domain has been set for this store yet');
  }
  if (tenant.domain.customDomainVerified) {
    return { customDomain: tenant.domain.customDomain, verified: true };
  }

  let records;
  try {
    records = await dns.resolveTxt(verificationHostFor(tenant.domain.customDomain));
  } catch {
    throw ApiError.badRequest(
      'Verification TXT record not found yet. DNS changes can take a few minutes to propagate — please try again shortly.'
    );
  }

  const found = records.some((chunks) => chunks.join('') === tenant.domain.customDomainVerificationToken);
  if (!found) {
    throw ApiError.badRequest('The verification TXT record was found but does not match the expected value');
  }

  tenant.domain.customDomainVerified = true;
  await tenant.save();
  await tenantService.invalidateTenantCache(tenant);

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'custom_domain.verified',
    metadata: { customDomain: tenant.domain.customDomain },
  });

  return { customDomain: tenant.domain.customDomain, verified: true };
}

async function removeCustomDomain({ actor }) {
  const tenantId = requestContext.getTenantId();

  // Snapshot before clearing: invalidateTenantCache needs the OLD
  // customDomain value to compute the cache key it must clear — by the
  // time findByIdAndUpdate returns the post-update document, that value is
  // already null, and the stale cache entry would otherwise linger forever.
  const before = await Tenant.findById(tenantId).select('domain').lean();

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    {
      $set: {
        'domain.customDomain': null,
        'domain.customDomainVerified': false,
        'domain.customDomainVerificationToken': null,
      },
    },
    { returnDocument: 'after' }
  );
  await tenantService.invalidateTenantCache(before);
  await tenantService.invalidateTenantCache(tenant);

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'custom_domain.removed',
  });
}

async function getDomainStatus() {
  const tenant = await Tenant.findById(requestContext.getTenantId()).select('domain').lean();
  if (!tenant.domain.customDomain) {
    return { customDomain: null, verified: false };
  }
  return {
    customDomain: tenant.domain.customDomain,
    verified: tenant.domain.customDomainVerified,
    verificationInstructions: tenant.domain.customDomainVerified
      ? undefined
      : {
          recordType: 'TXT',
          host: verificationHostFor(tenant.domain.customDomain),
          value: tenant.domain.customDomainVerificationToken,
        },
  };
}

module.exports = { setCustomDomain, verifyCustomDomain, removeCustomDomain, getDomainStatus };
