const { RazorpayConfig } = require('../../models/razorpayConfig.model');
const { encrypt, mask } = require('../../utils/encryption');
const { recordActivityLog } = require('./activityLogService');
const ApiError = require('../../utils/ApiError');

async function saveConfig({ keyId, keySecret, webhookSecret, actor }) {
  const config = await RazorpayConfig.findOneAndUpdate(
    {},
    {
      $set: {
        encryptedKeyId: encrypt(keyId),
        encryptedKeySecret: encrypt(keySecret),
        encryptedWebhookSecret: encrypt(webhookSecret),
        keyIdPreview: mask(keyId),
        isActive: true,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  await recordActivityLog({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    action: 'razorpay_config.updated',
    targetType: 'RazorpayConfig',
    targetId: config._id,
  });

  return config;
}

async function getConfig() {
  const config = await RazorpayConfig.findOne({});
  if (!config) throw ApiError.notFound('Razorpay is not configured for this store yet');
  return config;
}

module.exports = { saveConfig, getConfig };
