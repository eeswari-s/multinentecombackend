const { Queue } = require('bullmq');
const { getBullConnectionOptions } = require('../../config/redis');

const QUEUE_NAME = 'abandoned-cart';
const REPEATABLE_JOB_ID = 'hourly-abandoned-cart-check';

let queue;

function getAbandonedCartQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, getBullConnectionOptions());
  }
  return queue;
}

/**
 * Registers the recurring check. Idempotent — BullMQ dedupes repeatable
 * jobs by their jobId, so calling this on every worker startup does not
 * create duplicate schedules.
 */
async function scheduleAbandonedCartCheck() {
  const q = getAbandonedCartQueue();
  await q.add(
    'run-abandoned-cart-check',
    {},
    {
      jobId: REPEATABLE_JOB_ID,
      repeat: { pattern: '30 * * * *' }, // hourly, at :30
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
}

module.exports = { QUEUE_NAME, getAbandonedCartQueue, scheduleAbandonedCartCheck };
