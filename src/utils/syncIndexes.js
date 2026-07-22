const logger = require('./logger');

/**
 * Builds/drops indexes to match each model's current schema. Safe to call
 * on every worker boot — Mongoose's syncIndexes() is idempotent (a no-op
 * once indexes already match), which is what makes it safe to run
 * automatically here instead of requiring a manual one-off command against
 * a host that may not offer easy shell access (e.g. Render's free/starter
 * plans). Deliberately NOT run from the API process itself: if the API is
 * ever scaled to multiple instances, only one thing should be racing to
 * build indexes, and the worker is already the single-instance process by
 * convention in this deployment.
 */
async function syncAllIndexes(connection) {
  const modelNames = connection.modelNames();
  for (const name of modelNames) {
    const model = connection.model(name);
    // eslint-disable-next-line no-await-in-loop
    const created = await model.syncIndexes();
    if (created.length > 0) {
      logger.info(`Synced indexes for ${name}`, { created });
    }
  }
  logger.info('Index sync complete', { modelCount: modelNames.length });
}

module.exports = { syncAllIndexes };
