jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let acmeTenant;
let suspendedTenant;
let unverifiedDomainTenant;
let verifiedDomainTenant;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  await mongoose.connect(mongod.getUri());

  Tenant = require('../src/models/tenant.model').Tenant;

  acmeTenant = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'owner@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
  });

  suspendedTenant = await Tenant.create({
    businessName: 'Suspended Store',
    contactEmail: 'owner@suspended.test',
    domain: { subdomain: 'suspended-store' },
    status: 'suspended',
  });

  unverifiedDomainTenant = await Tenant.create({
    businessName: 'Unverified Domain Co',
    contactEmail: 'owner@unverifieddomain.test',
    domain: { subdomain: 'unverifieddomain', customDomain: 'shop.unverified.test', customDomainVerified: false },
    status: 'active',
  });

  verifiedDomainTenant = await Tenant.create({
    businessName: 'Verified Domain Co',
    contactEmail: 'owner@verifieddomain.test',
    domain: { subdomain: 'verifieddomain', customDomain: 'shop.verified.test', customDomainVerified: true },
    status: 'active',
  });

  const { resolveTenantFromDomain } = require('../src/middlewares/tenantResolver');
  const requestContext = require('../src/utils/requestContext');

  // Attach directly to the v1 sub-router (not `app`): app.js already mounts
  // the catch-all notFoundHandler/errorHandler at module-load time, and
  // `app.use()` after that point would register behind those catch-alls.
  const v1Router = require('../src/routes/v1');
  v1Router.get('/__test/whoami', resolveTenantFromDomain, (req, res) => {
    const tenant = requestContext.getTenant();
    res.json({ tenantId: requestContext.getTenantId(), businessName: tenant.businessName });
  });

  app = require('../src/app');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('tenant resolution from subdomain (storefront path)', () => {
  test('resolves the correct tenant from Host header subdomain', async () => {
    const res = await request(app)
      .get('/api/v1/__test/whoami')
      .set('Host', 'acme.myplatform.test');

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(String(acmeTenant._id));
    expect(res.body.businessName).toBe('Acme Foods');
  });

  test('unknown subdomain returns 404, not an unscoped fallthrough', async () => {
    const res = await request(app)
      .get('/api/v1/__test/whoami')
      .set('Host', 'doesnotexist.myplatform.test');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('suspended tenant is blocked with 403', async () => {
    const res = await request(app)
      .get('/api/v1/__test/whoami')
      .set('Host', 'suspended-store.myplatform.test');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('two concurrent requests for different tenants never cross-contaminate context', async () => {
    const [acmeRes, suspendedRes] = await Promise.all([
      request(app).get('/api/v1/__test/whoami').set('Host', 'acme.myplatform.test'),
      request(app).get('/api/v1/__test/whoami').set('Host', 'doesnotexist.myplatform.test'),
    ]);

    expect(acmeRes.status).toBe(200);
    expect(acmeRes.body.tenantId).toBe(String(acmeTenant._id));
    expect(suspendedRes.status).toBe(404);
  });
});

describe('tenant resolution from a custom domain', () => {
  test('an unverified custom domain never resolves (fails closed against domain-takeover)', async () => {
    const res = await request(app).get('/api/v1/__test/whoami').set('Host', 'shop.unverified.test');
    expect(res.status).toBe(404);
  });

  test('a verified custom domain resolves to its tenant', async () => {
    const res = await request(app).get('/api/v1/__test/whoami').set('Host', 'shop.verified.test');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(String(verifiedDomainTenant._id));
  });
});
