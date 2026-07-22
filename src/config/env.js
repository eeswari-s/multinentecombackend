const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({
  path: process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env'),
  quiet: true,
});

/**
 * This is the ONLY file in the codebase allowed to read process.env.
 * Every other module must import configuration values from the frozen
 * `env` object exported below. Fail fast at startup if anything required
 * is missing/malformed rather than booting with a silently-undefined secret.
 */

const hexKey32 = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');

const csv = z.string().transform((val) =>
  val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  BASE_DOMAIN: z.string().min(1, 'BASE_DOMAIN is required'),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  ENCRYPTION_KEY: hexKey32,

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  RAZORPAY_PLATFORM_KEY_ID: z.string().min(1),
  RAZORPAY_PLATFORM_KEY_SECRET: z.string().min(1),
  RAZORPAY_PLATFORM_WEBHOOK_SECRET: z.string().min(1),

  BREVO_PLATFORM_API_KEY: z.string().min(1),
  BREVO_PLATFORM_SENDER_EMAIL: z.string().email(),
  BREVO_PLATFORM_SENDER_NAME: z.string().min(1),

  CORS_ORIGINS: csv.default('http://localhost:3000'),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),

  PDF_RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional().default(''),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`\nFATAL: invalid environment configuration.\n${issues}\n`);
    process.exit(1);
  }

  const parsed = result.data;

  const config = {
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    isTest: parsed.NODE_ENV === 'test',
    port: parsed.PORT,
    baseDomain: parsed.BASE_DOMAIN,

    mongoUri: parsed.MONGO_URI,

    redisUrl: parsed.REDIS_URL,

    jwt: {
      accessSecret: parsed.JWT_ACCESS_SECRET,
      refreshSecret: parsed.JWT_REFRESH_SECRET,
      accessExpiry: parsed.JWT_ACCESS_EXPIRY,
      refreshExpiry: parsed.JWT_REFRESH_EXPIRY,
    },

    bcryptSaltRounds: parsed.BCRYPT_SALT_ROUNDS,

    encryptionKey: parsed.ENCRYPTION_KEY,

    cloudinary: {
      cloudName: parsed.CLOUDINARY_CLOUD_NAME,
      apiKey: parsed.CLOUDINARY_API_KEY,
      apiSecret: parsed.CLOUDINARY_API_SECRET,
    },

    razorpay: {
      platformKeyId: parsed.RAZORPAY_PLATFORM_KEY_ID,
      platformKeySecret: parsed.RAZORPAY_PLATFORM_KEY_SECRET,
      platformWebhookSecret: parsed.RAZORPAY_PLATFORM_WEBHOOK_SECRET,
    },

    brevo: {
      platformApiKey: parsed.BREVO_PLATFORM_API_KEY,
      platformSenderEmail: parsed.BREVO_PLATFORM_SENDER_EMAIL,
      platformSenderName: parsed.BREVO_PLATFORM_SENDER_NAME,
    },

    cors: {
      origins: parsed.CORS_ORIGINS,
    },

    logLevel: parsed.LOG_LEVEL,

    pdf: {
      renderConcurrency: parsed.PDF_RENDER_CONCURRENCY,
      executablePath: parsed.PUPPETEER_EXECUTABLE_PATH || undefined,
    },
  };

  return Object.freeze(config);
}

const env = loadEnv();

module.exports = env;
