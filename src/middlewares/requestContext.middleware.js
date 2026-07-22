const { randomUUID } = require('crypto');
const requestContext = require('../utils/requestContext');

/**
 * Must be the first middleware mounted in app.js. Opens the AsyncLocalStorage
 * context for the lifetime of the request so every later middleware/service
 * (tenant resolver, auth, logger, tenant-scope Mongoose plugin) can read/set
 * requestId/tenantId without threading them through function signatures.
 */
function requestContextMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim() ? incomingId.trim() : randomUUID();
  res.setHeader('x-request-id', requestId);

  requestContext.run({ requestId }, () => next());
}

module.exports = requestContextMiddleware;
