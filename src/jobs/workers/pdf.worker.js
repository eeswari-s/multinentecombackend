const { Worker } = require('bullmq');
const { QUEUE_NAME } = require('../queues/pdf.queue');
const { getBullConnectionOptions } = require('../../config/redis');
const { Tenant } = require('../../models/tenant.model');
const requestContext = require('../../utils/requestContext');
const pdfService = require('../../services/pdfService');
const env = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * `concurrency` caps how many PDF renders run in parallel across this
 * worker process — a burst of requests across many tenants cannot exhaust
 * server memory by all launching Puppeteer pages at once (section 6).
 */
function startPdfWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { tenantId, type, params, generatedBy } = job.data;
      const tenant = await Tenant.findById(tenantId).lean();
      if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

      const document = await requestContext.run({ tenantId: String(tenantId), tenant }, () =>
        pdfService.generateDocument({ type, params, generatedBy })
      );
      return document.toJSON();
    },
    { ...getBullConnectionOptions(), concurrency: env.pdf.renderConcurrency }
  );

  worker.on('failed', (job, err) => {
    logger.error('PDF generation job failed', { jobId: job?.id, type: job?.data?.type, error: err.message });
  });

  return worker;
}

module.exports = { startPdfWorker };
