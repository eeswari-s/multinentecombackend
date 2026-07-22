const { Queue } = require('bullmq');
const { getBullConnectionOptions } = require('../../config/redis');
const logger = require('../../utils/logger');

const QUEUE_NAME = 'analytics-ingestion';

let queue;

function getAnalyticsIngestionQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, getBullConnectionOptions());
  }
  return queue;
}

/**
 * Raw events are queued, not written inline — a burst of product-view
 * traffic must never add latency to the storefront request that
 * generated it (section 9: "raw events queued").
 */
async function enqueueAnalyticsEvents({ tenantId, customerId, events }) {
  try {
    const q = getAnalyticsIngestionQueue();
    await q.add(
      'ingest-events',
      { tenantId, customerId, events },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 500, removeOnFail: 500 }
    );
  } catch (err) {
    logger.error('Failed to enqueue analytics events — the triggering request still succeeds', {
      tenantId,
      count: events.length,
      error: err.message,
    });
  }
}

module.exports = { QUEUE_NAME, getAnalyticsIngestionQueue, enqueueAnalyticsEvents };
