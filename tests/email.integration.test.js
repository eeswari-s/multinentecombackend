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
let redisClient;
let runAcrossAllTenants;

let tenantId;
let ownerToken;
let impersonationToken;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ Customer } = require('../src/models/customer.model'));
  ({ hashPassword } = require('../src/utils/password'));
  ({ redisClient } = require('../src/config/redis'));
  ({ runAcrossAllTenants } = require('../src/services/superAdmin/crossTenantAccess'));

  const tenant = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
  });
  tenantId = String(tenant._id);

  const passwordHash = await hashPassword('Password123!');
  await User.create({ role: 'super_admin', name: 'Root Admin', email: 'root@platform.test', passwordHash });
  await User.create({ role: 'owner', tenantId: tenant._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });

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

  // Brevo config is platform-controlled (see rbac.js / permissions.js) —
  // only reachable via Super Admin's "Login As Client" impersonation.
  impersonationToken = (
    await request(app)
      .post(`/api/v1/super-admin/clients/${tenantId}/login-as`)
      .set('Authorization', `Bearer ${rootToken}`)
  ).body.data.accessToken;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function admin(req) {
  return req.set('Authorization', `Bearer ${ownerToken}`);
}

function impersonating(req) {
  return req.set('Authorization', `Bearer ${impersonationToken}`);
}

async function peekVerificationValue(persona, purpose, subjectId) {
  return redisClient.get(`verify:${persona}:${purpose}:${subjectId}`);
}

describe('Customer email verification (OTP)', () => {
  test('registration issues an OTP that must be verified', async () => {
    const registerRes = await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Jane Doe', email: 'jane-otp@test.com', password: 'Password123!' });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.customer.isVerified).toBe(false);

    const customerId = registerRes.body.data.customer._id;
    const code = await peekVerificationValue('customer', 'verify_email', customerId);
    expect(code).toMatch(/^\d{6}$/);

    const wrongCodeRes = await request(app)
      .post('/api/v1/customer/auth/verify-email')
      .set('Host', 'acme.myplatform.test')
      .send({ customerId, code: '000000' });
    expect(wrongCodeRes.status).toBe(400);

    const verifyRes = await request(app)
      .post('/api/v1/customer/auth/verify-email')
      .set('Host', 'acme.myplatform.test')
      .send({ customerId, code });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.isVerified).toBe(true);

    // Single-use: the same code cannot be replayed.
    const replayRes = await request(app)
      .post('/api/v1/customer/auth/verify-email')
      .set('Host', 'acme.myplatform.test')
      .send({ customerId, code });
    expect(replayRes.status).toBe(400);
  });

  test('resend-otp issues a fresh code and rejects an already-verified account', async () => {
    const registerRes = await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Resend Test', email: 'resend-otp@test.com', password: 'Password123!' });
    const customerId = registerRes.body.data.customer._id;

    const resendRes = await request(app)
      .post('/api/v1/customer/auth/resend-otp')
      .set('Host', 'acme.myplatform.test')
      .send({ customerId });
    expect(resendRes.status).toBe(200);

    const code = await peekVerificationValue('customer', 'verify_email', customerId);
    await request(app)
      .post('/api/v1/customer/auth/verify-email')
      .set('Host', 'acme.myplatform.test')
      .send({ customerId, code });

    const secondResendRes = await request(app)
      .post('/api/v1/customer/auth/resend-otp')
      .set('Host', 'acme.myplatform.test')
      .send({ customerId });
    expect(secondResendRes.status).toBe(409);
  });
});

describe('Customer forgot/reset password', () => {
  test('completes the full reset flow and revokes existing sessions', async () => {
    await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Reset Me', email: 'reset-me@test.com', password: 'OldPassword123!' });

    const customer = await runAcrossAllTenants(() => Customer.findOne({ email: 'reset-me@test.com' }).lean());

    const forgotRes = await request(app)
      .post('/api/v1/customer/auth/forgot-password')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'reset-me@test.com' });
    expect(forgotRes.status).toBe(200);

    const token = await peekVerificationValue('customer', 'reset_password', String(customer._id));
    expect(token).toBeTruthy();

    const resetRes = await request(app)
      .post('/api/v1/customer/auth/reset-password')
      .set('Host', 'acme.myplatform.test')
      .send({ customerId: String(customer._id), token, newPassword: 'NewPassword123!' });
    expect(resetRes.status).toBe(200);

    const oldLoginRes = await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'reset-me@test.com', password: 'OldPassword123!' });
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'reset-me@test.com', password: 'NewPassword123!' });
    expect(newLoginRes.status).toBe(200);
  });

  test('does not reveal whether an email is registered', async () => {
    const res = await request(app)
      .post('/api/v1/customer/auth/forgot-password')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'does-not-exist@test.com' });
    expect(res.status).toBe(200);
  });
});

describe('Admin forgot/reset password', () => {
  test('super_admin can reset their own password', async () => {
    const forgotRes = await request(app)
      .post('/api/v1/super-admin/auth/forgot-password')
      .send({ email: 'root@platform.test' });
    expect(forgotRes.status).toBe(200);

    const rootUser = await User.findOne({ email: 'root@platform.test' }).lean();
    const token = await peekVerificationValue('admin', 'reset_password', String(rootUser._id));
    expect(token).toBeTruthy();

    const resetRes = await request(app)
      .post('/api/v1/super-admin/auth/reset-password')
      .send({ userId: String(rootUser._id), token, newPassword: 'NewRootPass123!' });
    expect(resetRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/v1/super-admin/auth/login')
      .send({ email: 'root@platform.test', password: 'NewRootPass123!' });
    expect(loginRes.status).toBe(200);
  });

  test('client_admin owner can reset their own password, scoped to their tenant', async () => {
    const forgotRes = await request(app)
      .post('/api/v1/client-admin/auth/forgot-password')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test' });
    expect(forgotRes.status).toBe(200);

    const ownerUser = await User.findOne({ email: 'owner@acme.test', tenantId }).lean();
    const token = await peekVerificationValue('admin', 'reset_password', String(ownerUser._id));
    expect(token).toBeTruthy();

    const resetRes = await request(app)
      .post('/api/v1/client-admin/auth/reset-password')
      .send({ userId: String(ownerUser._id), token, newPassword: 'NewOwnerPass123!' });
    expect(resetRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'NewOwnerPass123!' });
    expect(loginRes.status).toBe(200);

    // Refresh ownerToken for any tests that might run after this file, if reused.
    ownerToken = loginRes.body.data.accessToken;
  });
});

describe('Client Admin Brevo configuration', () => {
  test('saves and reads back a masked config', async () => {
    const saveRes = await impersonating(request(app).put('/api/v1/client-admin/brevo-config')).send({
      apiKey: 'xkeysib-fake-brevo-key-1234',
      senderName: 'Acme Support',
      senderEmail: 'support@acme.test',
    });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.data.apiKeyPreview).toMatch(/\*+1234$/);
    expect(saveRes.body.data.encryptedApiKey).toBeUndefined();

    const getRes = await impersonating(request(app).get('/api/v1/client-admin/brevo-config'));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.senderEmail).toBe('support@acme.test');
  });
});
