const { ActivityLog } = require('../../models/activityLog.model');

async function recordActivityLog({ actorUserId, actorEmail, action, targetType, targetId, metadata = {} }) {
  await ActivityLog.create({ actorUserId, actorEmail, action, targetType, targetId, metadata });
}

module.exports = { recordActivityLog };
