const { Worker } = require('bullmq');
const { QUEUE_NAME } = require('../queues/analyticsRollup.queue');
const { getBullConnectionOptions } = require('../../config/redis');
const { runRollup } = require('../../services/analyticsRollupService');
const logger = require('../../utils/logger');

function startAnalyticsRollupWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const result = await runRollup(job.data.granularity);
      logger.info('Analytics rollup completed', result);
      return result;
    },
    { ...getBullConnectionOptions(), concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    logger.error('Analytics rollup job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}

module.exports = { startAnalyticsRollupWorker };
