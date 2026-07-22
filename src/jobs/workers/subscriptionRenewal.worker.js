const { Worker } = require('bullmq');
const { QUEUE_NAME } = require('../queues/subscriptionRenewal.queue');
const { getBullConnectionOptions } = require('../../config/redis');
const { runRenewalCheck } = require('../../services/superAdmin/subscriptionRenewalService');
const logger = require('../../utils/logger');

function startSubscriptionRenewalWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const result = await runRenewalCheck();
      logger.info('Subscription renewal check completed', result);
      return result;
    },
    getBullConnectionOptions()
  );

  worker.on('failed', (job, err) => {
    logger.error('Subscription renewal check failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}

module.exports = { startSubscriptionRenewalWorker };
