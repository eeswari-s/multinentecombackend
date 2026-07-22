jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let Customer;
let hashPassword;

let tenantA;
let tenantB;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ Customer } = require('../src/models/customer.model'));
  ({ hashPassword } = require('../src/utils/password'));

  tenantA = await Tenant.create({
    businessName: 'Rate Limit Tenant A',
    contactEmail: 'contact@ratelimit-a.test',
    domain: { subdomain: 'ratelimit-a' },
    status: 'active',
  });
  tenantB = await Tenant.create({
    businessName: 'Rate Limit Tenant B',
    contactEmail: 'contact@ratelimit-b.test',
    domain: { subdomain: 'ratelimit-b' },
    status: 'active',
  });

  const passwordHash = await hashPassword('Password123!');
  await Customer.create({ tenantId: tenantA._id, name: 'A Customer', email: 'customer@ratelimit-a.test', passwordHash, isVerified: true });
  await Customer.create({ tenantId: tenantB._id, name: 'B Customer', email: 'customer@ratelimit-b.test', passwordHash, isVerified: true });

  app = require('../src/app');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Tenant-aware auth rate limiting', () => {
  test('repeated failed logins against one tenant eventually return 429, without affecting a different tenant', async () => {
    let lastStatus;
    // authRateLimiter caps at 20 requests per 15-minute window per tenant+IP.
    for (let i = 0; i < 21; i += 1) {
      const res = await request(app)
        .post('/api/v1/customer/auth/login')
        .set('Host', 'ratelimit-a.myplatform.test')
        .send({ email: 'customer@ratelimit-a.test', password: 'WrongPassword!' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);

    // Tenant B, sharing the same test-runner IP, is unaffected — the limiter
    // key is scoped per-tenant, not per-IP alone.
    const otherTenantRes = await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'ratelimit-b.myplatform.test')
      .send({ email: 'customer@ratelimit-b.test', password: 'Password123!' });
    expect(otherTenantRes.status).toBe(200);
  }, 30000);
});
