const { BrevoConfig } = require('../../models/brevoConfig.model');
const { encrypt, mask } = require('../../utils/encryption');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

async function saveConfig({ apiKey, senderName, senderEmail, actor }) {
  const config = await BrevoConfig.findOneAndUpdate(
    {},
    {
      $set: {
        encryptedApiKey: encrypt(apiKey),
        apiKeyPreview: mask(apiKey),
        senderName,
        senderEmail,
        isActive: true,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'brevo_config.updated',
    targetType: 'BrevoConfig',
    targetId: config._id,
  });

  return config;
}

async function getConfig() {
  const config = await BrevoConfig.findOne({});
  if (!config) throw ApiError.notFound('Brevo is not configured for this store yet');
  return config;
}

module.exports = { saveConfig, getConfig };
