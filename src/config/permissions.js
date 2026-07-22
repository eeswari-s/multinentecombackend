/**
 * Coarse-grained, resource:action permission strings for the Client Admin
 * persona (owner/manager/support_staff). Deliberately built out now, even
 * though only "owner" is exercised at first, so RBAC has room to grow
 * without a schema migration later (per project brief section 8).
 *
 * super_admin does not use this table — Super Admin routes are gated by
 * role alone (see rbac.js requireRole) since they operate through the
 * separate cross-tenant service layer, not tenant permissions.
 */
const ALL_CLIENT_ADMIN_PERMISSIONS = [
  'staff:manage',
  'settings:manage',
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
  'reports:read',
  'notifications:manage',
  'activityLogs:read',
  'support:manage',
  'content:manage',
];

const ROLE_PERMISSIONS = {
  owner: ALL_CLIENT_ADMIN_PERMISSIONS,

  manager: ALL_CLIENT_ADMIN_PERMISSIONS.filter(
    (perm) => perm !== 'staff:manage' && perm !== 'settings:manage'
  ),

  support_staff: [
    'catalog:read',
    'orders:read',
    'orders:write',
    'customers:read',
    'reviews:moderate',
    'reports:read',
    'support:manage',
  ],
};

function hasPermission(role, permission) {
  if (role === 'super_admin') return true;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

module.exports = { ROLE_PERMISSIONS, ALL_CLIENT_ADMIN_PERMISSIONS, hasPermission };
