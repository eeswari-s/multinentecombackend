const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

/**
 * General-purpose client used for caching (tenant lookups, feature flags)
 * and as the refresh-token store. BullMQ queues/workers create their OWN
 * ioredis connections (see getBullConnectionOptions) because BullMQ requires
 * `maxRetriesPerRequest: null` on any connection it manages, which is not
 * appropriate for this general-purpose client.
 */
const redisClient = new Redis(env.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redisClient.on('connect', () => logger.info('Redis client connected'));
redisClient.on('error', (err) => logger.error('Redis client error', { error: err.message }));

function getBullConnectionOptions() {
  return {
    connection: {
      // BullMQ creates its own dedicated ioredis instance from this URL.
      ...parseRedisUrl(env.redisUrl),
      maxRetriesPerRequest: null,
    },
  };
}

function parseRedisUrl(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db: parsed.pathname && parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
    // Decomposing the URL into discrete fields (required so maxRetriesPerRequest
    // can be forced to null for BullMQ) otherwise silently drops TLS — a
    // rediss:// URL (e.g. Upstash) would connect over plain TCP to a
    // TLS-only endpoint and just hang with no error.
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

async function disconnectRedis() {
  await redisClient.quit();
}

module.exports = { redisClient, getBullConnectionOptions, disconnectRedis };
