const ms = require('ms');
const { redisClient } = require('../config/redis');
const env = require('../config/env');
const { fingerprint, safeCompare } = require('../utils/tokenHash');

const REFRESH_TTL_SECONDS = Math.ceil(ms(env.jwt.refreshExpiry) / 1000);

const tokenKey = (persona, userId, deviceId) => `auth:refresh:${persona}:${userId}:${deviceId}`;
const deviceSetKey = (persona, userId) => `auth:refresh:devices:${persona}:${userId}`;

/**
 * Server-side refresh-token store keyed by (persona, userId, deviceId) so
 * an individual device/session can be revoked on logout, password change,
 * or suspected compromise without invalidating every other logged-in device.
 */
async function storeRefreshToken({ persona, userId, deviceId, token }) {
  const key = tokenKey(persona, userId, deviceId);
  await redisClient
    .multi()
    .set(key, fingerprint(token), 'EX', REFRESH_TTL_SECONDS)
    .sadd(deviceSetKey(persona, userId), deviceId)
    .expire(deviceSetKey(persona, userId), REFRESH_TTL_SECONDS)
    .exec();
}

async function verifyRefreshToken({ persona, userId, deviceId, token }) {
  const stored = await redisClient.get(tokenKey(persona, userId, deviceId));
  if (!stored) return false;
  return safeCompare(fingerprint(token), stored);
}

async function revokeDevice({ persona, userId, deviceId }) {
  await redisClient.multi().del(tokenKey(persona, userId, deviceId)).srem(deviceSetKey(persona, userId), deviceId).exec();
}

async function revokeAllDevices({ persona, userId }) {
  const deviceIds = await redisClient.smembers(deviceSetKey(persona, userId));
  if (deviceIds.length === 0) return;

  const multi = redisClient.multi();
  for (const deviceId of deviceIds) {
    multi.del(tokenKey(persona, userId, deviceId));
  }
  multi.del(deviceSetKey(persona, userId));
  await multi.exec();
}

module.exports = { storeRefreshToken, verifyRefreshToken, revokeDevice, revokeAllDevices };
