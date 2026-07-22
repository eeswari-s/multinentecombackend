const env = require('./src/config/env');
const app = require('./src/app');
const logger = require('./src/utils/logger');
const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const { disconnectRedis } = require('./src/config/redis');

let server;

async function bootstrap() {
  await connectDatabase();
  logger.info('Connected to MongoDB');

  server = app.listen(env.port, () => {
    logger.info(`Server listening on port ${env.port}`, { nodeEnv: env.nodeEnv });
  });
}

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 15000);
  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await disconnectDatabase();
    await disconnectRedis();
    clearTimeout(forceExitTimer);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason.stack : reason });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.stack });
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.error('Failed to bootstrap application', { error: err.stack });
  process.exit(1);
});
