const { Worker } = require('bullmq');
const { QUEUE_NAME } = require('../queues/analyticsIngestion.queue');
const { getBullConnectionOptions } = require('../../config/redis');
const { AnalyticsEvent } = require('../../models/analyticsEvent.model');
const requestContext = require('../../utils/requestContext');
const logger = require('../../utils/logger');

function startAnalyticsIngestionWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { tenantId, customerId, events } = job.data;

      await requestContext.run({ tenantId }, () =>
        AnalyticsEvent.insertMany(
          events.map((event) => ({ ...event, customerId: customerId || event.customerId || null }))
        )
      );
    },
    { ...getBullConnectionOptions(), concurrency: 10 }
  );

  worker.on('failed', (job, err) => {
    logger.error('Analytics ingestion job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}

module.exports = { startAnalyticsIngestionWorker };
