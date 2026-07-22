const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const requestContextMiddleware = require('./middlewares/requestContext.middleware');
const httpLogger = require('./middlewares/httpLogger');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { isOriginAllowed, setCustomDomainChecker } = require('./utils/corsOriginValidator');
const tenantService = require('./services/tenantService');
const { apiRateLimiter } = require('./middlewares/rateLimiter');
const v1Router = require('./routes/v1');
const webhookRouter = require('./routes/v1/webhooks');

setCustomDomainChecker(async (origin) => {
  try {
    const { hostname } = new URL(origin);
    const tenant = await tenantService.getTenantByHost(hostname);
    return !!tenant && tenant.status === 'active';
  } catch {
    return false;
  }
});

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

// Must run first: opens the AsyncLocalStorage context for the request.
app.use(requestContextMiddleware);
app.use(httpLogger);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      isOriginAllowed(origin)
        .then((allowed) => callback(null, allowed))
        .catch((err) => callback(err));
    },
    credentials: true,
  })
);
app.use(compression());

// Mounted BEFORE the JSON body parser: Razorpay webhook signature
// verification needs the exact raw byte buffer, which express.json() would
// otherwise consume and parse away.
app.use('/api/v1/webhooks', express.raw({ type: 'application/json', limit: '1mb' }), webhookRouter);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(hpp());

app.get('/healthz', (req, res) => {
  res.status(200).json({ success: true, message: 'ok', data: { uptime: process.uptime() } });
});

// Baseline abuse protection across the whole API. Tenant is not yet resolved
// at this mount point (each route resolves it individually further down the
// tree — see tenantResolver.js), so this falls back to IP-based keying here;
// the genuinely tenant-aware, stricter limiter sits on the credential-guessing
// -prone auth endpoints themselves (see authRateLimiter in each auth.routes.js),
// which is where tenant-scoped brute-force protection actually matters.
app.use('/api/v1', apiRateLimiter, v1Router);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
