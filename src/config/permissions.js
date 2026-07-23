/**
 * Coarse-grained, resource:action permission strings for the Client Admin
 * persona (owner/manager/support_staff). Deliberately built out now, even
 * though only "owner" is exercised at first, so RBAC has room to grow
 * without a schema migration later (per project brief section 8).
 *
 * super_admin does not use this table — Super Admin routes are gated by
 * role alone (see rbac.js requireRole) since they operate through the
 * separate cross-tenant service layer, not tenant permissions.
 *
 * Platform-controlled areas (staff, branding, custom domain, payment/email
 * provider config, blog, reports, analytics, and the product SEO/GST fields)
 * are deliberately absent from every tenant-side role below — a tenant
 * account can never hold them directly. Super Admin reaches them by using
 * "Login As Client" (see rbac.js requirePermission's impersonation bypass),
 * not through a permission grant here.
 */
const ALL_CLIENT_ADMIN_PERMISSIONS = [
  'settings:shipping',
  'settings:subscription',
  'catalog:read',
  'catalog:write',
  'orders:read',
  'orders:write',
  'customers:read',
  'customers:write',
  'coupons:read',
  'coupons:write',
  'offers:read',
  'offers:write',
  'banners:write',
  'cms:write',
  'reviews:moderate',
  'notifications:manage',
  'activityLogs:read',
  'support:manage',
];

const ROLE_PERMISSIONS = {
  owner: ALL_CLIENT_ADMIN_PERMISSIONS,

  manager: ALL_CLIENT_ADMIN_PERMISSIONS.filter(
    (perm) => perm !== 'settings:shipping' && perm !== 'settings:subscription'
  ),

  support_staff: [
    'catalog:read',
    'orders:read',
    'orders:write',
    'customers:read',
    'reviews:moderate',
    'support:manage',
  ],
};

function hasPermission(role, permission) {
  if (role === 'super_admin') return true;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

module.exports = { ROLE_PERMISSIONS, ALL_CLIENT_ADMIN_PERMISSIONS, hasPermission };
