const requestContext = require('../../utils/requestContext');

/**
 * The ONLY sanctioned way to run a query across all tenants (SaaS Health
 * Dashboard, cross-client revenue, Super Admin client listing, etc).
 *
 * This must never be imported from Client Admin or Customer services —
 * it is intentionally kept in its own narrow module so the exception to
 * tenant isolation stays auditable and grep-able (see tenantScope.plugin.js).
 */
function runAcrossAllTenants(fn) {
  return requestContext.runWithOverrides({ bypassTenantScope: true, tenantId: undefined }, fn);
}

module.exports = { runAcrossAllTenants };
