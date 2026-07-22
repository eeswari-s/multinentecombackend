const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const billingOverviewService = require('../../services/superAdmin/billingOverviewService');

const listAll = asyncHandler(async (req, res) => {
  const result = await billingOverviewService.listAllInvoices(req.query);
  sendSuccess(res, { data: result });
});

const reconciliation = asyncHandler(async (req, res) => {
  const summary = await billingOverviewService.getReconciliationSummary(req.query);
  sendSuccess(res, { data: summary });
});

module.exports = { listAll, reconciliation };
