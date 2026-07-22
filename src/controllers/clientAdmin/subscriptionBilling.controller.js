const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const requestContext = require('../../utils/requestContext');
const subscriptionBillingService = require('../../services/clientAdmin/subscriptionBillingService');

const getCurrent = asyncHandler(async (req, res) => {
  const subscription = await subscriptionBillingService.getCurrentSubscription(requestContext.getTenantId());
  sendSuccess(res, { data: subscription });
});

const checkout = asyncHandler(async (req, res) => {
  const result = await subscriptionBillingService.initiateSubscriptionPayment({
    tenantId: requestContext.getTenantId(),
    billingCycle: req.body.billingCycle,
  });
  sendSuccess(res, { message: 'Subscription payment initiated', data: result });
});

const verifyPayment = asyncHandler(async (req, res) => {
  const invoice = await subscriptionBillingService.verifySubscriptionPayment({
    tenantId: requestContext.getTenantId(),
    ...req.body,
  });
  sendSuccess(res, { message: 'Subscription payment verified', data: invoice });
});

const listInvoices = asyncHandler(async (req, res) => {
  const result = await subscriptionBillingService.listInvoices(req.query);
  sendSuccess(res, { data: result });
});

module.exports = { getCurrent, checkout, verifyPayment, listInvoices };
