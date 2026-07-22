const requestContext = require('./requestContext');

/**
 * Every successful response in the API goes through this single envelope
 * so clients can rely on a consistent shape regardless of endpoint.
 */
function sendSuccess(res, { statusCode = 200, message = 'Success', data = null, meta = undefined } = {}) {
  const body = {
    success: true,
    message,
    data,
    requestId: requestContext.getRequestId() || null,
  };
  if (meta !== undefined) body.meta = meta;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess };
