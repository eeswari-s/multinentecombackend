jest.mock('ioredis', () => require('ioredis-mock'));

// Domain verification resolves a real DNS TXT record — mocked here since a
// unit/integration test can't control what a real domain's DNS actually
// returns. The mock defaults to "not found"; specific tests override it via
// mockResolvedValueOnce / mockRejectedValueOnce to exercise both paths.
const mockResolveTxt = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
jest.mock('dns', () => ({ promises: { resolveTxt: (...args) => mockResolveTxt(...args) } }));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let hashPassword;

let ownerToken;
let impersonationToken;
let otherImpersonationToken;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ hashPassword } = require('../src/utils/password'));

  const tenant = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
  });
  const otherTenant = await Tenant.create({
    businessName: 'Globex Traders',
    contactEmail: 'contact@globex.test',
    domain: { subdomain: 'globex' },
    status: 'active',
  });

  const passwordHash = await hashPassword('Password123!');
  await User.create({ role: 'owner', tenantId: tenant._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });
  await User.create({ role: 'owner', tenantId: otherTenant._id, name: 'Globex Owner', email: 'owner@globex.test', passwordHash });
  await User.create({
    role: 'super_admin',
    name: 'Root Admin',
    email: 'root@platform.test',
    passwordHash: await hashPassword('Password123!'),
  });

  app = require('../src/app');

  ownerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'Password123!' })
  ).body.data.accessToken;

  const rootToken = (
    await request(app)
      .post('/api/v1/super-admin/auth/login')
      .send({ email: 'root@platform.test', password: 'Password123!' })
  ).body.data.accessToken;

  // Custom domain management is platform-controlled (see rbac.js /
  // permissions.js) — a tenant's own login can no longer reach it directly,
  // only Super Admin's "Login As Client" impersonation session can.
  impersonationToken = (
    await request(app)
      .post(`/api/v1/super-admin/clients/${tenant._id}/login-as`)
      .set('Authorization', `Bearer ${rootToken}`)
  ).body.data.accessToken;
  otherImpersonationToken = (
    await request(app)
      .post(`/api/v1/super-admin/clients/${otherTenant._id}/login-as`)
      .set('Authorization', `Bearer ${rootToken}`)
  ).body.data.accessToken;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function owner(req) {
  return req.set('Authorization', `Bearer ${ownerToken}`);
}

function impersonating(req) {
  return req.set('Authorization', `Bearer ${impersonationToken}`);
}

describe('Custom domain management', () => {
  let verificationToken;

  test("a tenant's own owner login cannot manage its custom domain directly", async () => {
    const res = await owner(request(app).post('/api/v1/client-admin/store-settings/custom-domain')).send({
      customDomain: 'shop.acme-custom.test',
    });
    expect(res.status).toBe(403);
  });

  test('setting a custom domain returns TXT verification instructions and is unverified', async () => {
    const res = await impersonating(request(app).post('/api/v1/client-admin/store-settings/custom-domain')).send({
      customDomain: 'shop.acme-custom.test',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.verified).toBe(false);
    expect(res.body.data.verificationInstructions.recordType).toBe('TXT');
    expect(res.body.data.verificationInstructions.host).toBe('_platform-verify.shop.acme-custom.test');
    verificationToken = res.body.data.verificationInstructions.value;
  });

  test('another tenant cannot claim the same domain', async () => {
    const res = await request(app)
      .post('/api/v1/client-admin/store-settings/custom-domain')
      .set('Authorization', `Bearer ${otherImpersonationToken}`)
      .send({ customDomain: 'shop.acme-custom.test' });
    expect(res.status).toBe(409);
  });

  test('verification fails while the TXT record is missing', async () => {
    mockResolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const res = await impersonating(request(app).post('/api/v1/client-admin/store-settings/custom-domain/verify'));
    expect(res.status).toBe(400);
  });

  test('verification fails if the TXT record value does not match', async () => {
    mockResolveTxt.mockResolvedValueOnce([['wrong-token']]);
    const res = await impersonating(request(app).post('/api/v1/client-admin/store-settings/custom-domain/verify'));
    expect(res.status).toBe(400);
  });

  test('verification succeeds once the TXT record matches, and the domain becomes usable for tenant resolution', async () => {
    mockResolveTxt.mockResolvedValueOnce([[verificationToken]]);
    const res = await impersonating(request(app).post('/api/v1/client-admin/store-settings/custom-domain/verify'));
    expect(res.status).toBe(200);
    expect(res.body.data.verified).toBe(true);

    const statusRes = await impersonating(request(app).get('/api/v1/client-admin/store-settings/custom-domain'));
    expect(statusRes.body.data.verified).toBe(true);

    const storefrontRes = await request(app).get('/api/v1/customer/home').set('Host', 'shop.acme-custom.test');
    expect(storefrontRes.status).toBe(200);
  });

  test('removing the domain clears it and it no longer resolves', async () => {
    const res = await impersonating(request(app).delete('/api/v1/client-admin/store-settings/custom-domain'));
    expect(res.status).toBe(200);

    const storefrontRes = await request(app).get('/api/v1/customer/home').set('Host', 'shop.acme-custom.test');
    expect(storefrontRes.status).toBe(404);
  });
});
