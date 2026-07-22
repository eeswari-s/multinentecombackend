jest.mock('ioredis', () => require('ioredis-mock'));

// BullMQ can't run against ioredis-mock (confirmed elsewhere in this suite —
// Lua/msgpack scripts aren't supported), so the email queue is mocked here
// to assert on the failed-payment / renewal-reminder emails this section
// tests, rather than relying on the queue actually delivering anything.
jest.mock('../src/jobs/queues/email.queue', () => ({ enqueueEmail: jest.fn().mockResolvedValue(undefined) }));

jest.mock('../src/integrations/razorpay/platformClient', () => {
  let counter = 0;
  return {
    getPlatformRazorpayClient: jest.fn().mockReturnValue({
      orders: {
        create: jest.fn().mockImplementation(({ amount, currency }) => {
          counter += 1;
          return Promise.resolve({ id: `platform_order_${counter}`, amount, currency });
        }),
      },
    }),
  };
});

const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let SubscriptionPlan;
let AuditLog;
let hashPassword;
let runRenewalCheck;

let rootAdminToken;
let ownerToken;
let tenantId;
let planId;

// Must match .env's demo RAZORPAY_PLATFORM_KEY_SECRET / _WEBHOOK_SECRET —
// this is Flow A (the platform's own account), so unlike tenant Razorpay
// config, there is exactly one secret, sourced from env.js.
const PLATFORM_KEY_SECRET = 'demo_secret';
const PLATFORM_WEBHOOK_SECRET = 'demo_webhook_secret';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ SubscriptionPlan } = require('../src/models/subscriptionPlan.model'));
  ({ AuditLog } = require('../src/models/auditLog.model'));
  ({ hashPassword } = require('../src/utils/password'));
  ({ runRenewalCheck } = require('../src/services/superAdmin/subscriptionRenewalService'));

  const tenant = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
  });
  tenantId = String(tenant._id);

  const passwordHash = await hashPassword('Password123!');
  await User.create({
    role: 'super_admin',
    name: 'Root Admin',
    email: 'root@platform.test',
    passwordHash,
  });
  await User.create({ role: 'owner', tenantId: tenant._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });

  app = require('../src/app');

  rootAdminToken = (
    await request(app).post('/api/v1/super-admin/auth/login').send({ email: 'root@platform.test', password: 'Password123!' })
  ).body.data.accessToken;

  ownerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'Password123!' })
  ).body.data.accessToken;

  const plan = await SubscriptionPlan.create({
    name: 'Growth',
    pricing: { monthly: 99900, yearly: 999900 },
    isActive: true,
  });
  planId = String(plan._id);

  await request(app)
    .post(`/api/v1/super-admin/clients/${tenantId}/subscription/plan`)
    .set('Authorization', `Bearer ${rootAdminToken}`)
    .send({ planId, billingCycle: 'monthly' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function owner(req) {
  return req.set('Authorization', `Bearer ${ownerToken}`);
}
function root(req) {
  return req.set('Authorization', `Bearer ${rootAdminToken}`);
}

describe('Client Admin subscription billing (Flow A)', () => {
  test('owner can view the current subscription', async () => {
    const res = await owner(request(app).get('/api/v1/client-admin/subscription'));
    expect(res.status).toBe(200);
    expect(res.body.data.billingCycle).toBe('monthly');
  });

  test('initiates a platform Razorpay order and confirms on valid payment signature', async () => {
    const checkoutRes = await owner(request(app).post('/api/v1/client-admin/subscription/checkout')).send({
      billingCycle: 'monthly',
    });
    expect(checkoutRes.status).toBe(200);
    expect(checkoutRes.body.data.amount).toBe(99900);
    expect(checkoutRes.body.data.razorpayOrderId).toMatch(/^platform_order_\d+$/);

    const { razorpayOrderId } = checkoutRes.body.data;
    const razorpayPaymentId = 'pay_platform_1';
    const signature = crypto
      .createHmac('sha256', PLATFORM_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const badVerify = await owner(request(app).post('/api/v1/client-admin/subscription/verify-payment')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: 'wrong-signature-hex-value-000',
    });
    expect(badVerify.status).toBe(401);

    const goodVerify = await owner(request(app).post('/api/v1/client-admin/subscription/verify-payment')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: signature,
    });
    expect(goodVerify.status).toBe(200);
    expect(goodVerify.body.data.status).toBe('paid');

    const subRes = await owner(request(app).get('/api/v1/client-admin/subscription'));
    expect(subRes.body.data.status).toBe('active');
    expect(subRes.body.data.billingCycle).toBe('monthly');
  });

  test('billing history lists the paid invoice', async () => {
    const res = await owner(request(app).get('/api/v1/client-admin/subscription/invoices'));
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((inv) => inv.status === 'paid')).toBe(true);
  });

  test('Super Admin sees the same invoice in the cross-tenant billing overview', async () => {
    const res = await root(request(app).get('/api/v1/super-admin/billing/invoices'));
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((inv) => inv.tenantId === tenantId)).toBe(true);
  });
});

describe('Subscription renewal job', () => {
  test('a trial past its trialEndsAt enters the grace period (past_due), not immediate expiry', async () => {
    const trialTenant = await Tenant.create({
      businessName: 'Expiring Trial Co',
      contactEmail: 'trial@expiring.test',
      domain: { subdomain: 'expiringtrial' },
      status: 'active',
      subscription: { status: 'trial', trialEndsAt: new Date(Date.now() - 86400000) },
    });

    await runRenewalCheck();

    const reloaded = await Tenant.findById(trialTenant._id).lean();
    expect(reloaded.subscription.status).toBe('past_due');
    expect(reloaded.subscription.gracePeriodEndsAt).toBeTruthy();

    const auditEntry = await AuditLog.findOne({ action: 'subscription.trial_expired', tenantId: trialTenant._id });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry.actorUserId).toBeNull();
  });

  test('a subscription whose grace period has also elapsed becomes expired (read-only)', async () => {
    const lapsedTenant = await Tenant.create({
      businessName: 'Grace Elapsed Co',
      contactEmail: 'grace@elapsed.test',
      domain: { subdomain: 'graceelapsed' },
      status: 'active',
      subscription: { status: 'past_due', gracePeriodEndsAt: new Date(Date.now() - 1000) },
    });

    await runRenewalCheck();

    const reloaded = await Tenant.findById(lapsedTenant._id).lean();
    expect(reloaded.subscription.status).toBe('expired');

    const auditEntry = await AuditLog.findOne({
      action: 'subscription.period_expired',
      tenantId: lapsedTenant._id,
      'metadata.reason': 'grace_period_ended',
    });
    expect(auditEntry).not.toBeNull();
  });

  test('an expired (read-only) store rejects new checkouts', async () => {
    const readOnlyTenant = await Tenant.create({
      businessName: 'Read Only Co',
      contactEmail: 'readonly@test.com',
      domain: { subdomain: 'readonlyco' },
      status: 'active',
      subscription: { status: 'expired' },
    });
    const passwordHash = await hashPassword('Password123!');
    await User.create({ role: 'owner', tenantId: readOnlyTenant._id, name: 'Read Only Owner', email: 'owner@readonlyco.test', passwordHash });

    const ownerLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'readonlyco.myplatform.test')
      .send({ email: 'owner@readonlyco.test', password: 'Password123!' });
    const roToken = ownerLogin.body.data.accessToken;

    const catRes = await request(app)
      .post('/api/v1/client-admin/categories')
      .set('Authorization', `Bearer ${roToken}`)
      .send({ name: 'Read Only Category' });
    const productRes = await request(app)
      .post('/api/v1/client-admin/products')
      .set('Authorization', `Bearer ${roToken}`)
      .send({
        name: 'Read Only Product',
        category: catRes.body.data._id,
        variants: [{ sku: 'READONLY-1', price: 100, stock: 10 }],
        status: 'published',
      });

    await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'readonlyco.myplatform.test')
      .send({ name: 'Read Only Customer', email: 'ro-customer@test.com', password: 'Password123!' });
    const customerToken = (
      await request(app)
        .post('/api/v1/customer/auth/login')
        .set('Host', 'readonlyco.myplatform.test')
        .send({ email: 'ro-customer@test.com', password: 'Password123!' })
    ).body.data.accessToken;
    const customer = (req) => req.set('Host', 'readonlyco.myplatform.test').set('Authorization', `Bearer ${customerToken}`);

    // Browsing still works.
    const browseRes = await request(app).get('/api/v1/customer/home').set('Host', 'readonlyco.myplatform.test');
    expect(browseRes.status).toBe(200);

    // But checkout is blocked.
    await customer(request(app).post('/api/v1/customer/cart/items')).send({
      productId: productRes.body.data._id,
      sku: 'READONLY-1',
      quantity: 1,
    });
    await customer(request(app).put('/api/v1/customer/checkout/shipping-address')).send({
      name: 'Read Only Customer',
      phone: '9999999999',
      line1: '1 Test St',
      city: 'Chennai',
      state: 'TN',
      pincode: '600001',
    });
    const checkoutRes = await customer(request(app).post('/api/v1/customer/checkout')).send({ paymentMethod: 'cod' });
    expect(checkoutRes.status).toBe(403);
  });

  test('flags a subscription nearing renewal, emails the owner, and does not touch its status', async () => {
    const soon = new Date(Date.now() + 86400000); // 1 day from now
    const dueTenant = await Tenant.create({
      businessName: 'Due Soon Co',
      contactEmail: 'due@soon.test',
      domain: { subdomain: 'duesoon' },
      status: 'active',
      subscription: { status: 'active', currentPeriodEnd: soon },
    });
    const passwordHash = await hashPassword('Password123!');
    await User.create({ role: 'owner', tenantId: dueTenant._id, name: 'Due Soon Owner', email: 'owner@duesoon.test', passwordHash });

    const { enqueueEmail } = require('../src/jobs/queues/email.queue');
    enqueueEmail.mockClear();

    const result = await runRenewalCheck();
    expect(result.reminderCount).toBeGreaterThanOrEqual(1);

    const reloaded = await Tenant.findById(dueTenant._id).lean();
    expect(reloaded.subscription.status).toBe('active');

    const reminderEntry = await AuditLog.findOne({ action: 'subscription.renewal_due', tenantId: dueTenant._id });
    expect(reminderEntry).not.toBeNull();

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'subscription_renewal_reminder', to: 'owner@duesoon.test' })
    );
  });
});

describe('Failed subscription payments (platform webhook)', () => {
  test('a payment.failed webhook marks the invoice failed, audit-logs it, and emails the owner', async () => {
    const { enqueueEmail } = require('../src/jobs/queues/email.queue');
    enqueueEmail.mockClear();

    const checkoutRes = await owner(request(app).post('/api/v1/client-admin/subscription/checkout')).send({
      billingCycle: 'monthly',
    });
    const { razorpayOrderId } = checkoutRes.body.data;

    const payload = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: { order_id: razorpayOrderId, id: 'pay_failed_1', error_description: 'Card declined' },
        },
      },
    });
    const signature = crypto.createHmac('sha256', PLATFORM_WEBHOOK_SECRET).update(payload).digest('hex');

    const res = await request(app)
      .post('/api/v1/webhooks/razorpay-platform')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(payload);
    expect(res.status).toBe(200);

    const { SubscriptionInvoice } = require('../src/models/subscriptionInvoice.model');
    const { runAcrossAllTenants } = require('../src/services/superAdmin/crossTenantAccess');
    const invoice = await runAcrossAllTenants(() =>
      SubscriptionInvoice.findOne({ 'razorpay.orderId': razorpayOrderId }).lean()
    );
    expect(invoice.status).toBe('failed');
    expect(invoice.failureReason).toBe('Card declined');

    const auditEntry = await AuditLog.findOne({ action: 'subscription.payment_failed', tenantId });
    expect(auditEntry).not.toBeNull();

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'subscription_payment_failed', to: 'owner@acme.test' })
    );
  });

  test('rejects a webhook with an invalid signature', async () => {
    const payload = JSON.stringify({ event: 'payment.failed', payload: {} });
    const res = await request(app)
      .post('/api/v1/webhooks/razorpay-platform')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'not-a-valid-signature-0000000000000000000000000000000000000000')
      .send(payload);
    expect(res.status).toBe(400);
  });
});

describe('RBAC on subscription billing', () => {
  test('a non-owner staff account cannot access subscription billing', async () => {
    const passwordHash = await hashPassword('Password123!');
    await User.create({
      role: 'manager',
      tenantId,
      name: 'Acme Manager',
      email: 'manager@acme.test',
      passwordHash,
    });

    const managerLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'manager@acme.test', password: 'Password123!' });

    const res = await request(app)
      .get('/api/v1/client-admin/subscription')
      .set('Authorization', `Bearer ${managerLogin.body.data.accessToken}`);

    expect(res.status).toBe(403);
  });
});
