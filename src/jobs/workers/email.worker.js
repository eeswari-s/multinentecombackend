const { Worker } = require('bullmq');
const { QUEUE_NAME } = require('../queues/email.queue');
const { getBullConnectionOptions } = require('../../config/redis');
const emailService = require('../../services/emailService');
const logger = require('../../utils/logger');

function startEmailWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await emailService.sendEmail(job.data);
    },
    { ...getBullConnectionOptions(), concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    logger.error('Email send job failed', {
      jobId: job?.id,
      type: job?.data?.type,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    });
  });

  return worker;
}

module.exports = { startEmailWorker };
