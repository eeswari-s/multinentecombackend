const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const platformNotificationService = require('../../services/superAdmin/platformNotificationService');

const list = asyncHandler(async (req, res) => {
  const result = await platformNotificationService.listNotifications(req.query);
  sendSuccess(res, { data: result });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await platformNotificationService.markAsRead(req.params.id);
  sendSuccess(res, { message: 'Marked as read', data: notification });
});

const markAllRead = asyncHandler(async (req, res) => {
  await platformNotificationService.markAllAsRead();
  sendSuccess(res, { message: 'All notifications marked as read' });
});

module.exports = { list, markRead, markAllRead };
