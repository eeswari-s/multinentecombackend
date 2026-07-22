const crypto = require('crypto');
const { redisClient } = require('../config/redis');

const key = (persona, purpose, subjectId) => `verify:${persona}:${purpose}:${subjectId}`;

/**
 * Short-lived, single-use codes/tokens backed by Redis (not MongoDB —
 * these are ephemeral by nature, same rationale as the refresh-token
 * store). Used for OTP verification and password-reset links across both
 * the admin and customer personas.
 */
async function issueNumericCode({ persona, purpose, subjectId, ttlSeconds = 600 }) {
  const code = crypto.randomInt(100000, 999999).toString();
  await redisClient.set(key(persona, purpose, subjectId), code, 'EX', ttlSeconds);
  return code;
}

async function issueToken({ persona, purpose, subjectId, ttlSeconds = 1800 }) {
  const token = crypto.randomBytes(32).toString('base64url');
  await redisClient.set(key(persona, purpose, subjectId), token, 'EX', ttlSeconds);
  return token;
}

function safeStringEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function verifyAndConsume({ persona, purpose, subjectId, value }) {
  const redisKey = key(persona, purpose, subjectId);
  const stored = await redisClient.get(redisKey);
  if (!stored || typeof value !== 'string' || !safeStringEqual(stored, value)) return false;
  await redisClient.del(redisKey);
  return true;
}

module.exports = { issueNumericCode, issueToken, verifyAndConsume };
