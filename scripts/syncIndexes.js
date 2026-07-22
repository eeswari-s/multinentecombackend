/**
 * Manual one-off index sync — useful for confirming index state locally or
 * against a specific environment without starting the full worker process.
 * In deployed environments, the worker already runs this automatically on
 * every boot (see jobs/workers/index.js), so this script is a convenience,
 * not a required deploy step.
 *
 * Usage: node scripts/syncIndexes.js
 */
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { syncAllIndexes } = require('../src/utils/syncIndexes');
const logger = require('../src/utils/logger');

// Ensures every model file has been loaded (and so registered with
// Mongoose) before syncAllIndexes runs.
require('../src/app');

async function main() {
  const connection = await connectDatabase();
  await syncAllIndexes(connection);
  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  logger.error('Index sync failed', { error: err.stack });
  process.exit(1);
});
