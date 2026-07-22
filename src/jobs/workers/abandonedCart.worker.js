const { Worker } = require('bullmq');
const { QUEUE_NAME } = require('../queues/abandonedCart.queue');
const { getBullConnectionOptions } = require('../../config/redis');
const { runAbandonedCartCheck } = require('../../services/customer/abandonedCartService');
const logger = require('../../utils/logger');

function startAbandonedCartWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const result = await runAbandonedCartCheck();
      logger.info('Abandoned cart check completed', result);
      return result;
    },
    getBullConnectionOptions()
  );

  worker.on('failed', (job, err) => {
    logger.error('Abandoned cart check failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}

module.exports = { startAbandonedCartWorker };
