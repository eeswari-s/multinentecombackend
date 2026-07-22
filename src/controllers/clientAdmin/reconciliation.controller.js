const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const reportDataService = require('../../services/clientAdmin/reportDataService');

const getReconciliation = asyncHandler(async (req, res) => {
  const report = await reportDataService.getReconciliationReportData(req.query);
  sendSuccess(res, { data: report });
});

module.exports = { getReconciliation };
