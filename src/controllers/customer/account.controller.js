const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const accountService = require('../../services/customer/accountService');
const gdprService = require('../../services/customer/gdprService');

const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await accountService.getDashboard(req.auth.userId);
  sendSuccess(res, { data: dashboard });
});

const exportData = asyncHandler(async (req, res) => {
  const data = await gdprService.exportMyData(req.auth.userId);
  sendSuccess(res, { data });
});

const deleteAccount = asyncHandler(async (req, res) => {
  await gdprService.deleteMyAccount(req.auth.userId);
  sendSuccess(res, { message: 'Your account has been deleted' });
});

module.exports = { getDashboard, exportData, deleteAccount };
