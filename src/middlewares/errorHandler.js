const { ZodError } = require('zod');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const requestContext = require('../utils/requestContext');

function normalizeError(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return ApiError.badRequest(
      'Validation failed',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    );
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return ApiError.badRequest(
      'Validation failed',
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }))
    );
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for field '${err.path}'`);
  }

  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(', ') || 'field';
    return ApiError.conflict(`Duplicate value for ${field}`);
  }

  if (err && err.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Invalid token');
  }

  if (err && err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Token expired');
  }

  return ApiError.internal(err && err.message ? err.message : 'Internal server error');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const normalized = normalizeError(err);

  const logPayload = {
    statusCode: normalized.statusCode,
    code: normalized.code,
    path: req.originalUrl,
    method: req.method,
  };

  if (normalized.statusCode >= 500) {
    logger.error(err.stack || err.message, logPayload);
  } else {
    logger.warn(normalized.message, logPayload);
  }

  res.status(normalized.statusCode).json({
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
    requestId: requestContext.getRequestId() || null,
  });
}

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

module.exports = { errorHandler, notFoundHandler };
