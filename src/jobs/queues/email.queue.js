const { Queue } = require('bullmq');
const { getBullConnectionOptions } = require('../../config/redis');
const logger = require('../../utils/logger');

const QUEUE_NAME = 'email-send';

let queue;

function getEmailQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, getBullConnectionOptions());
  }
  return queue;
}

/**
 * Every transactional email in the system goes through here rather than
 * calling emailService.sendEmail directly — a slow/failed Brevo API call
 * must never block or fail the request that triggered it, and failed
 * sends retry with exponential backoff.
 *
 * Failing to ENQUEUE (e.g. a transient Redis blip) must equally never fail
 * the calling request — registration/checkout/order updates are the
 * business-critical operation; the email is a side effect of it, not a
 * precondition. Errors are logged so they're visible for reconciliation,
 * not silently swallowed.
 */
async function enqueueEmail({ tenantId = null, type, to, data = {}, attachments = [] }) {
  try {
    const q = getEmailQueue();
    await q.add(
      'send-email',
      { tenantId, type, to, data, attachments },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      }
    );
  } catch (err) {
    logger.error('Failed to enqueue email — the triggering request still succeeds', {
      type,
      to,
      tenantId,
      error: err.message,
    });
  }
}

module.exports = { QUEUE_NAME, getEmailQueue, enqueueEmail };
