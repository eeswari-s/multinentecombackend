const { Tenant } = require('../../models/tenant.model');
const { Product } = require('../../models/product.model');
const { User } = require('../../models/user.model');
const { Order } = require('../../models/order.model');
const requestContext = require('../../utils/requestContext');
const ApiError = require('../../utils/ApiError');

async function getEffectiveLimits() {
  const tenant = await Tenant.findById(requestContext.getTenantId()).populate('subscription.planId').lean();
  return tenant?.subscription?.planId?.limits || {};
}

/**
 * Each assert* is a no-op when the tenant has no plan assigned or the plan
 * doesn't cap that resource (limit is null) — quotas are opt-in per plan,
 * not a blanket restriction, so a tenant on a limitless/enterprise plan (or
 * one Super Admin hasn't configured a limit for yet) is never blocked.
 */
async function assertProductQuota() {
  const { maxProducts } = await getEffectiveLimits();
  if (maxProducts == null) return;

  const currentCount = await Product.countDocuments({});
  if (currentCount >= maxProducts) {
    throw ApiError.forbidden(`Your plan allows a maximum of ${maxProducts} products. Upgrade your plan to add more.`);
  }
}

async function assertStaffQuota() {
  const { maxStaffUsers } = await getEffectiveLimits();
  if (maxStaffUsers == null) return;

  // User isn't auto tenant-scoped (super_admin accounts have no tenantId at
  // all, so the model can't use the standard tenantScope plugin) — this
  // query must scope by tenantId explicitly, and count only actual invited
  // staff roles, not the owner or an unrelated super_admin account.
  const currentCount = await User.countDocuments({
    tenantId: requestContext.getTenantId(),
    role: { $in: ['manager', 'support_staff'] },
  });
  if (currentCount >= maxStaffUsers) {
    throw ApiError.forbidden(`Your plan allows a maximum of ${maxStaffUsers} staff accounts. Upgrade your plan to add more.`);
  }
}

async function assertOrderQuota() {
  const { maxOrdersPerMonth } = await getEffectiveLimits();
  if (maxOrdersPerMonth == null) return;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const currentCount = await Order.countDocuments({ status: { $ne: 'cart' }, createdAt: { $gte: startOfMonth } });
  if (currentCount >= maxOrdersPerMonth) {
    throw ApiError.forbidden(
      `Your plan allows a maximum of ${maxOrdersPerMonth} orders per month, and that limit has been reached. Upgrade your plan to accept more orders.`
    );
  }
}

module.exports = { getEffectiveLimits, assertProductQuota, assertStaffQuota, assertOrderQuota };
