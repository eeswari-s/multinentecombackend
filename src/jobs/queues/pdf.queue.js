const { Queue, QueueEvents } = require('bullmq');
const { getBullConnectionOptions } = require('../../config/redis');

const QUEUE_NAME = 'pdf-generate';

let queue;
let queueEvents;

function getPdfQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, getBullConnectionOptions());
  }
  return queue;
}

function getQueueEvents() {
  if (!queueEvents) {
    queueEvents = new QueueEvents(QUEUE_NAME, getBullConnectionOptions());
  }
  return queueEvents;
}

async function enqueuePdfGeneration({ tenantId, type, params = {}, generatedBy = null }) {
  const q = getPdfQueue();
  return q.add(
    'generate-pdf',
    { tenantId, type, params, generatedBy },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    }
  );
}

/**
 * PDF rendering is genuinely a background job (runs in the worker process,
 * never inline in the request handler — section 6) but is usually fast
 * enough that the API can afford to wait a bounded amount of time and hand
 * the client a ready URL in one round trip. If it doesn't finish in time,
 * callers fall back to returning the job id for polling.
 */
async function waitForJob(job, timeoutMs = 20000) {
  return job.waitUntilFinished(getQueueEvents(), timeoutMs);
}

module.exports = { QUEUE_NAME, getPdfQueue, enqueuePdfGeneration, waitForJob };
