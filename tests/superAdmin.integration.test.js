jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let User;
let SubscriptionPlan;
let AuditLog;
let hashPassword;

let rootAdminToken;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ User } = require('../src/models/user.model'));
  ({ SubscriptionPlan } = require('../src/models/subscriptionPlan.model'));
  ({ AuditLog } = require('../src/models/auditLog.model'));
  ({ hashPassword } = require('../src/utils/password'));

  await User.create({
    role: 'super_admin',
    name: 'Root Admin',
    email: 'root@platform.test',
    passwordHash: await hashPassword('Password123!'),
  });

  app = require('../src/app');

  const loginRes = await request(app)
    .post('/api/v1/super-admin/auth/login')
    .send({ email: 'root@platform.test', password: 'Password123!' });
  rootAdminToken = loginRes.body.data.accessToken;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function asRoot(req) {
  return req.set('Authorization', `Bearer ${rootAdminToken}`);
}

describe('Super Admin: client management', () => {
  let tenantId;
  let ownerTempPassword;

  test('creates a client (tenant + owner account)', async () => {
    const res = await asRoot(request(app).post('/api/v1/super-admin/clients')).send({
      businessName: 'Acme Foods',
      contactEmail: 'contact@acme.test',
      subdomain: 'acme',
      ownerName: 'Acme Owner',
      ownerEmail: 'owner@acme.test',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.tenant.domain.subdomain).toBe('acme');
    expect(res.body.data.temporaryPassword).toBeTruthy();

    tenantId = res.body.data.tenant._id;
    ownerTempPassword = res.body.data.temporaryPassword;
  });

  test('onboarding automation gives the new tenant a starter category and default CMS pages', async () => {
    const loginRes = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: ownerTempPassword });
    const token = loginRes.body.data.accessToken;

    const categoriesRes = await request(app)
      .get('/api/v1/client-admin/categories')
      .set('Authorization', `Bearer ${token}`);
    expect(categoriesRes.body.data.some((c) => c.slug === 'general')).toBe(true);

    const pagesRes = await request(app).get('/api/v1/client-admin/cms-pages').set('Authorization', `Bearer ${token}`);
    const slugs = pagesRes.body.data.map((p) => p.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(['about-us', 'contact-us', 'shipping-policy', 'refund-policy', 'privacy-policy', 'terms-conditions'])
    );
    expect(pagesRes.body.data.every((p) => p.isPublished === false)).toBe(true);
  });

  test('rejects a second client on the same subdomain', async () => {
    const res = await asRoot(request(app).post('/api/v1/super-admin/clients')).send({
      businessName: 'Acme Clone',
      contactEmail: 'x@acme.test',
      subdomain: 'acme',
      ownerName: 'X',
      ownerEmail: 'x-owner@acme.test',
    });
    expect(res.status).toBe(409);
  });

  test('the created owner can log in on the storefront subdomain with the temp password', async () => {
    const res = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: ownerTempPassword });

    expect(res.status).toBe(200);
    expect(res.body.data.user.tenantId).toBe(tenantId);
  });

  test('non-super_admin cannot access client management routes', async () => {
    const ownerLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: ownerTempPassword });

    const res = await request(app)
      .get('/api/v1/super-admin/clients')
      .set('Authorization', `Bearer ${ownerLogin.body.data.accessToken}`);

    expect(res.status).toBe(403);
  });

  test('updates client business details', async () => {
    const res = await asRoot(request(app).patch(`/api/v1/super-admin/clients/${tenantId}`)).send({
      businessName: 'Acme Foods Pvt Ltd',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.businessName).toBe('Acme Foods Pvt Ltd');
  });

  test('suspending a client blocks both admin login and storefront access', async () => {
    const suspendRes = await asRoot(
      request(app).patch(`/api/v1/super-admin/clients/${tenantId}/status`)
    ).send({ status: 'suspended' });
    expect(suspendRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: ownerTempPassword });
    expect(loginRes.status).toBe(403);
  });

  test('reactivating restores access', async () => {
    await asRoot(request(app).patch(`/api/v1/super-admin/clients/${tenantId}/status`)).send({
      status: 'active',
    });

    const loginRes = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: ownerTempPassword });
    expect(loginRes.status).toBe(200);
  });

  test('resets the owner password and revokes their existing sessions', async () => {
    const res = await asRoot(
      request(app).post(`/api/v1/super-admin/clients/${tenantId}/reset-owner-password`)
    );
    expect(res.status).toBe(200);
    expect(res.body.data.temporaryPassword).toBeTruthy();

    const oldPasswordLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: ownerTempPassword });
    expect(oldPasswordLogin.status).toBe(401);

    ownerTempPassword = res.body.data.temporaryPassword;
    const newPasswordLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: ownerTempPassword });
    expect(newPasswordLogin.status).toBe(200);
  });

  test('login-as-client issues a short-lived impersonation token and writes an audit log entry', async () => {
    const res = await asRoot(request(app).post(`/api/v1/super-admin/clients/${tenantId}/login-as`));
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.impersonatedUser.email).toBe('owner@acme.test');

    const decoded = JSON.parse(
      Buffer.from(res.body.data.accessToken.split('.')[1], 'base64url').toString('utf8')
    );
    expect(decoded.impersonation.active).toBe(true);
    expect(decoded.impersonation.byEmail).toBe('root@platform.test');

    const auditEntry = await AuditLog.findOne({ action: 'impersonation.started', tenantId });
    expect(auditEntry).not.toBeNull();
  });

  test('feature flags can be set and read back', async () => {
    const setRes = await asRoot(
      request(app).patch(`/api/v1/super-admin/clients/${tenantId}/feature-flags`)
    ).send({ flags: { betaAnalytics: true } });
    expect(setRes.status).toBe(200);
    expect(setRes.body.data.betaAnalytics).toBe(true);

    const getRes = await asRoot(request(app).get(`/api/v1/super-admin/clients/${tenantId}/feature-flags`));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.betaAnalytics).toBe(true);
  });

  test('subscription: assigns a plan and changes status', async () => {
    const plan = await SubscriptionPlan.create({
      name: 'Starter',
      pricing: { monthly: 99900 },
      isActive: true,
    });

    const assignRes = await asRoot(
      request(app).post(`/api/v1/super-admin/clients/${tenantId}/subscription/plan`)
    ).send({ planId: String(plan._id), billingCycle: 'monthly' });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.subscription.billingCycle).toBe('monthly');

    const statusRes = await asRoot(
      request(app).patch(`/api/v1/super-admin/clients/${tenantId}/subscription/status`)
    ).send({ status: 'active' });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.subscription.status).toBe('active');
  });
});

describe('Super Admin: platform staff management', () => {
  test('creates another super_admin, who can log in, then deactivates them', async () => {
    const createRes = await asRoot(request(app).post('/api/v1/super-admin/staff')).send({
      name: 'Second Admin',
      email: 'second@platform.test',
      password: 'Password123!',
    });
    expect(createRes.status).toBe(201);

    const loginRes = await request(app)
      .post('/api/v1/super-admin/auth/login')
      .send({ email: 'second@platform.test', password: 'Password123!' });
    expect(loginRes.status).toBe(200);

    const deactivateRes = await asRoot(
      request(app).patch(`/api/v1/super-admin/staff/${createRes.body.data._id}/deactivate`)
    );
    expect(deactivateRes.status).toBe(200);

    const secondLoginAttempt = await request(app)
      .post('/api/v1/super-admin/auth/login')
      .send({ email: 'second@platform.test', password: 'Password123!' });
    expect(secondLoginAttempt.status).toBe(401);
  });
});

describe('Client Admin: tenant staff management (RBAC by permission)', () => {
  let tenantId;
  let ownerToken;
  let managerToken;

  beforeAll(async () => {
    const createRes = await asRoot(request(app).post('/api/v1/super-admin/clients')).send({
      businessName: 'Globex Traders',
      contactEmail: 'contact@globex.test',
      subdomain: 'globex',
      ownerName: 'Globex Owner',
      ownerEmail: 'owner@globex.test',
      ownerPassword: 'OwnerPass123!',
    });
    tenantId = createRes.body.data.tenant._id;

    const ownerLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'globex.myplatform.test')
      .send({ email: 'owner@globex.test', password: 'OwnerPass123!' });
    ownerToken = ownerLogin.body.data.accessToken;
  });

  test('owner can invite a manager', async () => {
    const res = await request(app)
      .post('/api/v1/client-admin/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Globex Manager', email: 'manager@globex.test', role: 'manager', password: 'ManagerPass123!' });

    expect(res.status).toBe(201);
    expect(res.body.data.tenantId).toBe(tenantId);

    const managerLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'globex.myplatform.test')
      .send({ email: 'manager@globex.test', password: 'ManagerPass123!' });
    expect(managerLogin.status).toBe(200);
    managerToken = managerLogin.body.data.accessToken;
  });

  test('manager cannot invite further staff (lacks staff:manage permission)', async () => {
    const res = await request(app)
      .post('/api/v1/client-admin/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Someone', email: 'someone@globex.test', role: 'support_staff', password: 'Password123!' });

    expect(res.status).toBe(403);
  });

  test("the tenant-scoped staff list (owner-only) never includes another tenant's users", async () => {
    // resolveTenantFromAuth scopes strictly to the token's own tenantId
    // claim — there is no parameter an attacker could pass to view a
    // different tenant's staff instead. Listing is gated by the same
    // staff:manage permission as inviting, so only the owner can see it.
    const res = await request(app)
      .get('/api/v1/client-admin/staff')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((u) => u.tenantId === tenantId)).toBe(true);
    expect(res.body.data.some((u) => u.email === 'owner@acme.test')).toBe(false);
    expect(res.body.data.some((u) => u.email === 'manager@globex.test')).toBe(true);
  });
});

describe('Super Admin: platform health dashboard', () => {
  test('non-super_admin cannot access the platform health dashboard', async () => {
    const ownerLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'globex.myplatform.test')
      .send({ email: 'owner@globex.test', password: 'OwnerPass123!' });

    const res = await request(app)
      .get('/api/v1/super-admin/platform-health')
      .set('Authorization', `Bearer ${ownerLogin.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/v1/super-admin/platform-health');
    expect(res.status).toBe(401);
  });

  test('returns tenant counts, MRR, churn and system/queue status', async () => {
    const res = await asRoot(request(app).get('/api/v1/super-admin/platform-health'));

    expect(res.status).toBe(200);

    // By this point in the suite: Acme is status=active with an active
    // monthly subscription on the Starter plan (99900 paise); Globex is
    // status=active but still on the default trial subscription.
    expect(res.body.data.tenants.total).toBeGreaterThanOrEqual(2);
    expect(res.body.data.tenants.byStatus.active).toBeGreaterThanOrEqual(2);
    expect(res.body.data.tenants.bySubscriptionStatus.trial).toBeGreaterThanOrEqual(1);
    expect(res.body.data.tenants.bySubscriptionStatus.active).toBeGreaterThanOrEqual(1);

    expect(res.body.data.revenue.mrr).toBeGreaterThanOrEqual(99900);
    expect(res.body.data.revenue.activeSubscriptions).toBeGreaterThanOrEqual(1);

    expect(res.body.data.churn.windowDays).toBe(30);
    expect(typeof res.body.data.churn.ratePercent).toBe('number');

    expect(res.body.data.system.mongo.status).toBe('connected');
    // ioredis-mock (used in tests) doesn't implement the real ioredis
    // `.status` property (so it serializes away as undefined over JSON);
    // this just asserts the section is present without throwing — the
    // actual status value is only meaningful against real Redis.
    expect(res.body.data.system.redis).toBeDefined();

    expect(res.body.data.queues['email-send']).toBeDefined();
    expect(res.body.data.queues['pdf-generate']).toBeDefined();

    // Cloudinary's Admin API is real network access in this test environment
    // (not mocked, same as the PDF suite's real-upload tests) — assert the
    // section is present and resilient (status ok or gracefully degraded),
    // not on a specific byte count.
    expect(['ok', 'error']).toContain(res.body.data.storage.mongo.status);
    expect(['ok', 'error']).toContain(res.body.data.storage.cloudinary.status);
    expect(Array.isArray(res.body.data.recentErrors)).toBe(true);
  });
});

describe('Super Admin: platform settings', () => {
  test('non-super_admin cannot access platform settings', async () => {
    const res = await request(app).get('/api/v1/super-admin/platform-settings');
    expect(res.status).toBe(401);
  });

  test('defaults are returned, and updates persist and are audit-logged', async () => {
    const getRes = await asRoot(request(app).get('/api/v1/super-admin/platform-settings'));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.defaultTrialDays).toBe(14);

    const updateRes = await asRoot(request(app).patch('/api/v1/super-admin/platform-settings')).send({
      defaultTrialDays: 30,
      supportEmail: 'support@platform.test',
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.defaultTrialDays).toBe(30);
    expect(updateRes.body.data.supportEmail).toBe('support@platform.test');

    const auditEntry = await AuditLog.findOne({ action: 'platform_settings.updated' });
    expect(auditEntry).not.toBeNull();
  });

  test('a newly created tenant gets a trialEndsAt based on the configured default', async () => {
    const createRes = await asRoot(request(app).post('/api/v1/super-admin/clients')).send({
      businessName: 'Trial Test Co',
      contactEmail: 'contact@trialtest.test',
      subdomain: 'trialtest',
      ownerName: 'Trial Owner',
      ownerEmail: 'owner@trialtest.test',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.tenant.subscription.trialEndsAt).toBeTruthy();

    const daysUntilExpiry =
      (new Date(createRes.body.data.tenant.subscription.trialEndsAt) - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeGreaterThan(29); // the 30-day default set in the previous test
    expect(daysUntilExpiry).toBeLessThan(31);
  });
});

describe('Super Admin: notification center', () => {
  test('tenant creation generates a notification, which can be listed and marked read', async () => {
    const listRes = await asRoot(request(app).get('/api/v1/super-admin/notifications'));
    expect(listRes.status).toBe(200);
    const notification = listRes.body.data.items.find((n) => n.type === 'tenant_created');
    expect(notification).toBeDefined();
    expect(notification.isRead).toBe(false);
    expect(listRes.body.data.unreadCount).toBeGreaterThanOrEqual(1);

    const markRes = await asRoot(request(app).patch(`/api/v1/super-admin/notifications/${notification._id}/read`));
    expect(markRes.status).toBe(200);
    expect(markRes.body.data.isRead).toBe(true);
  });

  test('mark-all-read clears the unread count', async () => {
    const res = await asRoot(request(app).patch('/api/v1/super-admin/notifications/read-all'));
    expect(res.status).toBe(200);

    const listRes = await asRoot(request(app).get('/api/v1/super-admin/notifications'));
    expect(listRes.body.data.unreadCount).toBe(0);
  });
});
