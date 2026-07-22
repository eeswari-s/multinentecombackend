const { BrevoConfig } = require('../models/brevoConfig.model');
const { Tenant } = require('../models/tenant.model');
const { decrypt } = require('../utils/encryption');
const { createBrevoClient } = require('../integrations/brevo/client');
const { renderEmail } = require('./emailTemplates');
const requestContext = require('../utils/requestContext');
const env = require('../config/env');
const logger = require('../utils/logger');

async function resolveSenderConfig(tenantId) {
  if (!tenantId) {
    return {
      apiKey: env.brevo.platformApiKey,
      senderEmail: env.brevo.platformSenderEmail,
      senderName: env.brevo.platformSenderName,
    };
  }

  const config = await BrevoConfig.findOne({ isActive: true });
  if (config) {
    return { apiKey: decrypt(config.encryptedApiKey), senderEmail: config.senderEmail, senderName: config.senderName };
  }

  // Tenant hasn't configured their own Brevo account yet — fall back to
  // the platform's so core flows (OTP, order confirmation) still work.
  return {
    apiKey: env.brevo.platformApiKey,
    senderEmail: env.brevo.platformSenderEmail,
    senderName: env.brevo.platformSenderName,
  };
}

async function sendEmailWithinContext({ tenantId, type, to, data, attachments }) {
  const { apiKey, senderEmail, senderName } = await resolveSenderConfig(tenantId);
  const tenant = tenantId ? requestContext.getTenant() : null;
  const storeName = tenant?.businessName || senderName;

  const { subject, html } = renderEmail(type, { storeName, ...data });

  const client = createBrevoClient(apiKey);
  await client.transactionalEmails.sendTransacEmail({
    sender: { email: senderEmail, name: senderName },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    attachment: attachments && attachments.length > 0 ? attachments : undefined,
  });

  logger.info('Email sent', { type, to, tenantId: tenantId || null });
}

/**
 * Single entry point for every transactional email in the system (section
 * 5 of the brief): always resolves a tenant (or explicit platform
 * context) and an email type before picking the correct Brevo API key +
 * sender identity. Must only be called from the email queue's worker
 * (jobs/workers/email.worker.js) — never directly from a request handler —
 * so a slow/failed Brevo call never blocks the request that triggered it.
 *
 * Runs outside any HTTP request, so unlike request-handling code there is
 * no tenantResolver middleware to populate AsyncLocalStorage — this
 * establishes tenant context itself before touching BrevoConfig (which is
 * tenant-scoped).
 */
async function sendEmail({ tenantId = null, type, to, data = {}, attachments = [] }) {
  if (!tenantId) {
    return sendEmailWithinContext({ tenantId: null, type, to, data, attachments });
  }

  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new Error(`Cannot send email: tenant ${tenantId} not found`);

  return requestContext.run({ tenantId: String(tenantId), tenant }, () =>
    sendEmailWithinContext({ tenantId, type, to, data, attachments })
  );
}

module.exports = { sendEmail };
