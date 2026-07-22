const { Queue } = require('bullmq');
const { getBullConnectionOptions } = require('../../config/redis');

const QUEUE_NAME = 'subscription-renewal';
const REPEATABLE_JOB_ID = 'daily-subscription-renewal-check';

let queue;

function getSubscriptionRenewalQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, getBullConnectionOptions());
  }
  return queue;
}

/**
 * Registers the recurring daily check. Idempotent — BullMQ dedupes
 * repeatable jobs by their jobId, so calling this on every worker startup
 * does not create duplicate schedules.
 */
async function scheduleDailyRenewalCheck() {
  const q = getSubscriptionRenewalQueue();
  await q.add(
    'run-renewal-check',
    {},
    {
      jobId: REPEATABLE_JOB_ID,
      repeat: { pattern: '0 3 * * *' }, // daily at 03:00 server time
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
}

module.exports = { QUEUE_NAME, getSubscriptionRenewalQueue, scheduleDailyRenewalCheck };
