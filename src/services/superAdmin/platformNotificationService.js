const { PlatformNotification } = require('../../models/platformNotification.model');
const ApiError = require('../../utils/ApiError');

async function notify({ type, title, message, tenantId = null }) {
  await PlatformNotification.create({ type, title, message, tenantId });
}

async function listNotifications({ page = 1, limit = 20, unreadOnly }) {
  const filter = unreadOnly ? { isRead: false } : {};
  const [items, total, unreadCount] = await Promise.all([
    PlatformNotification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PlatformNotification.countDocuments(filter),
    PlatformNotification.countDocuments({ isRead: false }),
  ]);
  return { items, total, page, limit, unreadCount };
}

async function markAsRead(id) {
  const notification = await PlatformNotification.findByIdAndUpdate(id, { $set: { isRead: true } }, { returnDocument: 'after' });
  if (!notification) throw ApiError.notFound('Notification not found');
  return notification;
}

async function markAllAsRead() {
  await PlatformNotification.updateMany({ isRead: false }, { $set: { isRead: true } });
}

module.exports = { notify, listNotifications, markAsRead, markAllAsRead };
