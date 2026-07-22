const { Queue } = require('bullmq');
const { getBullConnectionOptions } = require('../../config/redis');

const QUEUE_NAME = 'analytics-rollup';

let queue;

function getAnalyticsRollupQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, getBullConnectionOptions());
  }
  return queue;
}

async function scheduleRollupJobs() {
  const q = getAnalyticsRollupQueue();

  await q.add(
    'hourly-rollup',
    { granularity: 'hourly' },
    { jobId: 'hourly-analytics-rollup', repeat: { pattern: '5 * * * *' }, removeOnComplete: 100, removeOnFail: 100 }
  );
  await q.add(
    'daily-rollup',
    { granularity: 'daily' },
    { jobId: 'daily-analytics-rollup', repeat: { pattern: '15 0 * * *' }, removeOnComplete: 100, removeOnFail: 100 }
  );
}

module.exports = { QUEUE_NAME, getAnalyticsRollupQueue, scheduleRollupJobs };
