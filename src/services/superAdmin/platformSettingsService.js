const { PlatformSettings } = require('../../models/platformSettings.model');
const { recordAuditLog } = require('./auditLogService');

async function getSettings() {
  const settings = await PlatformSettings.findOneAndUpdate({}, {}, { upsert: true, returnDocument: 'after' });
  return settings;
}

async function updateSettings({ updates, actor }) {
  const settings = await PlatformSettings.findOneAndUpdate(
    {},
    { $set: updates },
    { upsert: true, returnDocument: 'after' }
  );

  await recordAuditLog({
    action: 'platform_settings.updated',
    actorUserId: actor.userId,
    actorEmail: actor.email,
    metadata: { updates: Object.keys(updates) },
  });

  return settings;
}

module.exports = { getSettings, updateSettings };
