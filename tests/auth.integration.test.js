jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let Customer;
let hashPassword;

let acme;
let globex;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ Customer } = require('../src/models/customer.model'));
  ({ hashPassword } = require('../src/utils/password'));

  acme = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'owner@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
  });
  globex = await Tenant.create({
    businessName: 'Globex Traders',
    contactEmail: 'owner@globex.test',
    domain: { subdomain: 'globex' },
    status: 'active',
  });

  const passwordHash = await hashPassword('Password123!');

  await User.create({
    role: 'super_admin',
    name: 'Root Admin',
    email: 'root@platform.test',
    passwordHash,
  });

  await User.create({
    role: 'owner',
    tenantId: acme._id,
    name: 'Acme Owner',
    email: 'staff@example.com',
    passwordHash,
  });

  await User.create({
    role: 'support_staff',
    tenantId: acme._id,
    name: 'Acme Support',
    email: 'support@acme.test',
    passwordHash,
  });

  // Same email, different tenant — must be a fully independent account.
  await User.create({
    role: 'owner',
    tenantId: globex._id,
    name: 'Globex Owner',
    email: 'staff@example.com',
    passwordHash,
  });

  // Attach diagnostic routes for exercising the auth+rbac middleware chain,
  // mirroring the pattern used in tenantResolver.integration.test.js.
  const v1Router = require('../src/routes/v1');
  const { authenticate, requirePersona } = require('../src/middlewares/auth');
  const { requirePermission } = require('../src/middlewares/rbac');
  const { resolveTenantFromAuth } = require('../src/middlewares/tenantResolver');

  v1Router.get(
    '/__test/staff-only',
    authenticate,
    requirePersona('admin'),
    resolveTenantFromAuth,
    requirePermission('staff:manage'),
    (req, res) => res.json({ success: true, data: req.auth })
  );

  v1Router.get(
    '/__test/customer-only',
    authenticate,
    requirePersona('customer'),
    (req, res) => res.json({ success: true, data: req.auth })
  );

  app = require('../src/app');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Super Admin auth', () => {
  test('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/v1/super-admin/auth/login')
      .send({ email: 'root@platform.test', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  test('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/super-admin/auth/login')
      .send({ email: 'root@platform.test', password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  test('refresh rotates the token and invalidates the old refresh token', async () => {
    const loginRes = await request(app)
      .post('/api/v1/super-admin/auth/login')
      .send({ email: 'root@platform.test', password: 'Password123!', deviceId: 'device-1' });

    const { refreshToken } = loginRes.body.data;

    const refreshRes = await request(app)
      .post('/api/v1/super-admin/auth/refresh')
      .send({ refreshToken, deviceId: 'device-1' });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.refreshToken).not.toBe(refreshToken);

    const replayRes = await request(app)
      .post('/api/v1/super-admin/auth/refresh')
      .send({ refreshToken, deviceId: 'device-1' });

    expect(replayRes.status).toBe(401);
  });

  test('logout revokes the refresh token for that device', async () => {
    const loginRes = await request(app)
      .post('/api/v1/super-admin/auth/login')
      .send({ email: 'root@platform.test', password: 'Password123!', deviceId: 'device-2' });

    const { accessToken, refreshToken } = loginRes.body.data;

    const logoutRes = await request(app)
      .post('/api/v1/super-admin/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceId: 'device-2' });

    expect(logoutRes.status).toBe(200);

    const refreshRes = await request(app)
      .post('/api/v1/super-admin/auth/refresh')
      .send({ refreshToken, deviceId: 'device-2' });

    expect(refreshRes.status).toBe(401);
  });
});

describe('Client Admin auth (tenant-scoped)', () => {
  test('logs in scoped to the resolved tenant', async () => {
    const res = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'staff@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.tenantId).toBe(String(acme._id));
  });

  test('the same email resolves to a DIFFERENT account on a different tenant', async () => {
    const res = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'globex.myplatform.test')
      .send({ email: 'staff@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.tenantId).toBe(String(globex._id));
  });

  test('staff:manage is platform-controlled: only Super Admin impersonation reaches it, not the owner or support_staff directly', async () => {
    const ownerLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'staff@example.com', password: 'Password123!' });

    const ownerRes = await request(app)
      .get('/api/v1/__test/staff-only')
      .set('Authorization', `Bearer ${ownerLogin.body.data.accessToken}`);
    expect(ownerRes.status).toBe(403);

    const staffLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'support@acme.test', password: 'Password123!' });

    const staffRes = await request(app)
      .get('/api/v1/__test/staff-only')
      .set('Authorization', `Bearer ${staffLogin.body.data.accessToken}`);
    expect(staffRes.status).toBe(403);

    const rootLogin = await request(app)
      .post('/api/v1/super-admin/auth/login')
      .send({ email: 'root@platform.test', password: 'Password123!' });
    const impersonationToken = (
      await request(app)
        .post(`/api/v1/super-admin/clients/${acme._id}/login-as`)
        .set('Authorization', `Bearer ${rootLogin.body.data.accessToken}`)
    ).body.data.accessToken;

    const impersonatedRes = await request(app)
      .get('/api/v1/__test/staff-only')
      .set('Authorization', `Bearer ${impersonationToken}`);
    expect(impersonatedRes.status).toBe(200);
  });

  test('a customer-persona token cannot access an admin-persona route', async () => {
    await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Jane Doe', email: 'jane@customer.test', password: 'Password123!' });

    const customerLogin = await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'jane@customer.test', password: 'Password123!' });

    const res = await request(app)
      .get('/api/v1/__test/staff-only')
      .set('Authorization', `Bearer ${customerLogin.body.data.accessToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Customer auth (tenant-scoped)', () => {
  test('registers and logs in scoped to the storefront tenant', async () => {
    await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'globex.myplatform.test')
      .send({ name: 'Bob Smith', email: 'bob@customer.test', password: 'Password123!' });

    const loginRes = await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'globex.myplatform.test')
      .send({ email: 'bob@customer.test', password: 'Password123!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.customer.tenantId).toBe(String(globex._id));

    const res = await request(app)
      .get('/api/v1/__test/customer-only')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
    expect(res.status).toBe(200);
  });

  test('the same email can register independently on two different tenants', async () => {
    await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Dup Email', email: 'dup@customer.test', password: 'Password123!' });

    const secondRes = await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'globex.myplatform.test')
      .send({ name: 'Dup Email', email: 'dup@customer.test', password: 'Password123!' });

    expect(secondRes.status).toBe(201);
  });

  test('registering the same email twice on the SAME tenant is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Dup Email', email: 'dup@customer.test', password: 'Password123!' });

    expect(res.status).toBe(409);
  });
});
