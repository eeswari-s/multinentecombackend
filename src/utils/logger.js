const winston = require('winston');
const env = require('../config/env');
const requestContext = require('./requestContext');

const { combine, timestamp, errors, json } = winston.format;

const contextInjector = winston.format((info) => {
  info.tenantId = requestContext.getTenantId() || null;
  info.requestId = requestContext.getRequestId() || null;
  return info;
});

const logger = winston.createLogger({
  level: env.logLevel,
  format: combine(contextInjector(), timestamp(), errors({ stack: true }), json()),
  defaultMeta: { service: 'multitenant-ecommerce-backend' },
  transports: [
    new winston.transports.Console({
      silent: env.isTest,
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

module.exports = logger;
