const { Tenant } = require('../../models/tenant.model');
const { Order } = require('../../models/order.model');
const { Customer } = require('../../models/customer.model');
const requestContext = require('../../utils/requestContext');
const platformSettingsService = require('../superAdmin/platformSettingsService');
const { enqueueEmail } = require('../../jobs/queues/email.queue');
const logger = require('../../utils/logger');

async function findAndNotifyAbandonedCartsForTenant(cutoff) {
  const carts = await Order.find({
    status: 'cart',
    'items.0': { $exists: true },
    updatedAt: { $lt: cutoff },
    abandonedCartReminderSentAt: null,
  }).lean();

  let sent = 0;
  for (const cart of carts) {
    const customer = await Customer.findById(cart.customerId).lean();
    if (!customer) continue;

    await enqueueEmail({
      tenantId: requestContext.getTenantId(),
      type: 'abandoned_cart',
      to: customer.email,
      data: { customerName: customer.name, items: cart.items },
    });

    await Order.updateOne({ _id: cart._id }, { $set: { abandonedCartReminderSentAt: new Date() } });
    sent += 1;
  }

  return sent;
}

/**
 * Runs on a schedule (see jobs/workers/abandonedCart.worker.js) across
 * every active tenant — each cart is only ever reminded once
 * (abandonedCartReminderSentAt gates it), so this is safe to run as
 * often as the schedule likes without spamming a customer.
 */
async function runAbandonedCartCheck() {
  const { abandonedCartThresholdHours } = await platformSettingsService.getSettings();
  const cutoff = new Date(Date.now() - abandonedCartThresholdHours * 60 * 60 * 1000);

  const tenants = await Tenant.find({ status: 'active' }).lean();
  let totalSent = 0;

  for (const tenant of tenants) {
    try {
      const sent = await requestContext.run({ tenantId: String(tenant._id), tenant }, () =>
        findAndNotifyAbandonedCartsForTenant(cutoff)
      );
      totalSent += sent;
    } catch (err) {
      logger.error('Abandoned cart check failed for tenant', { tenantId: String(tenant._id), error: err.message });
    }
  }

  return { tenantCount: tenants.length, remindersSent: totalSent };
}

module.exports = { runAbandonedCartCheck };
