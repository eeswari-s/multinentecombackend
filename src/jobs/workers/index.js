const env = require('../../config/env');
const { connectDatabase } = require('../../config/database');
const { syncAllIndexes } = require('../../utils/syncIndexes');
const logger = require('../../utils/logger');
const { startSubscriptionRenewalWorker } = require('./subscriptionRenewal.worker');
const { scheduleDailyRenewalCheck } = require('../queues/subscriptionRenewal.queue');
const { startEmailWorker } = require('./email.worker');
const { startPdfWorker } = require('./pdf.worker');
const { closeBrowser } = require('../../services/pdfRenderer');
const { startAnalyticsIngestionWorker } = require('./analyticsIngestion.worker');
const { startAnalyticsRollupWorker } = require('./analyticsRollup.worker');
const { scheduleRollupJobs } = require('../queues/analyticsRollup.queue');
const { startAbandonedCartWorker } = require('./abandonedCart.worker');
const { scheduleAbandonedCartCheck } = require('../queues/abandonedCart.queue');

/**
 * Separate process from the API server (index.js) — run via `npm run worker`.
 * As more queues are added (email, PDF, analytics rollups), their
 * workers/schedules are wired in here alongside the renewal worker.
 */
async function main() {
  const connection = await connectDatabase();
  logger.info('Worker process connected to MongoDB');

  // Pulls in the full route tree so every model file is registered with
  // Mongoose before syncAllIndexes runs — the queues/workers below only
  // transitively require the models THEY touch, not every model in the app.
  require('../../app');
  await syncAllIndexes(connection);

  startSubscriptionRenewalWorker();
  await scheduleDailyRenewalCheck();
  startEmailWorker();
  startPdfWorker();
  startAnalyticsIngestionWorker();
  startAnalyticsRollupWorker();
  await scheduleRollupJobs();
  startAbandonedCartWorker();
  await scheduleAbandonedCartCheck();

  logger.info('Background workers started', { nodeEnv: env.nodeEnv });
}

async function shutdown(signal) {
  logger.info(`Worker process received ${signal}, shutting down`);
  await closeBrowser();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  logger.error('Failed to start worker process', { error: err.stack });
  process.exit(1);
});
