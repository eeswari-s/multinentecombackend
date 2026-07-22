jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('../src/integrations/razorpay/tenantClient', () => {
  const actual = jest.requireActual('../src/integrations/razorpay/tenantClient');
  let orderCounter = 0;
  return {
    ...actual,
    getTenantRazorpayClient: jest.fn().mockResolvedValue({
      orders: {
        create: jest.fn().mockImplementation(() => {
          orderCounter += 1;
          return Promise.resolve({ id: `order_test_mocked_${orderCounter}`, amount: 20000, currency: 'INR' });
        }),
      },
      payments: {
        refund: jest.fn().mockImplementation((paymentId, { amount }) =>
          Promise.resolve({ id: `rfnd_test_${paymentId}`, amount })
        ),
      },
    }),
  };
});

jest.mock('../src/integrations/razorpay/platformClient', () => ({
  getPlatformRazorpayClient: jest.fn().mockReturnValue({
    orders: { create: jest.fn().mockResolvedValue({ id: 'platform_order_1', amount: 10000, currency: 'INR' }) },
  }),
}));

const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let SubscriptionPlan;
let hashPassword;
let runAcrossAllTenants;

let acme;
let ownerToken;
const RZP_KEY_SECRET = 'fake_test_key_secret';
const RZP_WEBHOOK_SECRET = 'fake_test_webhook_secret';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ SubscriptionPlan } = require('../src/models/subscriptionPlan.model'));
  ({ hashPassword } = require('../src/utils/password'));
  ({ runAcrossAllTenants } = require('../src/services/superAdmin/crossTenantAccess'));

  acme = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
  });

  const passwordHash = await hashPassword('Password123!');
  await User.create({ role: 'super_admin', name: 'Root Admin', email: 'root@platform.test', passwordHash });
  await User.create({ role: 'owner', tenantId: acme._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });

  app = require('../src/app');

  ownerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'Password123!' })
  ).body.data.accessToken;

  await request(app)
    .put('/api/v1/client-admin/razorpay-config')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ keyId: 'rzp_test_fake', keySecret: RZP_KEY_SECRET, webhookSecret: RZP_WEBHOOK_SECRET });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function owner(req) {
  return req.set('Authorization', `Bearer ${ownerToken}`);
}

function root(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}

async function createProductAndCategory() {
  const catRes = await owner(request(app).post('/api/v1/client-admin/categories')).send({ name: 'Refund Category' });
  const productRes = await owner(request(app).post('/api/v1/client-admin/products')).send({
    name: 'Refund Product',
    category: catRes.body.data._id,
    variants: [{ sku: `REFUND-${Date.now()}`, price: 200, stock: 20 }],
    status: 'published',
  });
  return productRes.body.data;
}

async function registerAndLoginCustomer(email) {
  await request(app)
    .post('/api/v1/customer/auth/register')
    .set('Host', 'acme.myplatform.test')
    .send({ name: 'Refund Customer', email, password: 'Password123!' });
  const login = await request(app)
    .post('/api/v1/customer/auth/login')
    .set('Host', 'acme.myplatform.test')
    .send({ email, password: 'Password123!' });
  return login.body.data.accessToken;
}

describe('Flow B: refunds and reconciliation', () => {
  let codOrderId;
  let razorpayOrderId;

  test('a COD order can be refunded as a bookkeeping record, with no Razorpay call', async () => {
    const product = await createProductAndCategory();
    const customerToken = await registerAndLoginCustomer('cod-refund@test.com');
    const customer = (req) => req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${customerToken}`);

    await customer(request(app).post('/api/v1/customer/cart/items')).send({
      productId: product._id,
      sku: product.variants[0].sku,
      quantity: 1,
    });
    await customer(request(app).put('/api/v1/customer/checkout/shipping-address')).send({
      name: 'Refund Customer',
      phone: '9999999999',
      line1: '1 Test St',
      city: 'Chennai',
      state: 'TN',
      pincode: '600001',
    });
    const checkoutRes = await customer(request(app).post('/api/v1/customer/checkout')).send({ paymentMethod: 'cod' });
    codOrderId = checkoutRes.body.data.order._id;

    const refundRes = await owner(request(app).post(`/api/v1/client-admin/orders/${codOrderId}/refund`)).send({
      reason: 'Customer changed their mind',
    });
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.data.paymentStatus).toBe('refunded');
    expect(refundRes.body.data.refund.razorpayRefundId).toBeNull();
    // grandTotal = 200 item subtotal + 49 flat shipping (below the free-shipping threshold)
    expect(refundRes.body.data.refund.amount).toBe(249);
  });

  test('refunding the same order twice is rejected', async () => {
    const res = await owner(request(app).post(`/api/v1/client-admin/orders/${codOrderId}/refund`));
    expect(res.status).toBe(409);
  });

  test('a Razorpay-paid order is refunded through the tenant\'s own Razorpay account', async () => {
    const product = await createProductAndCategory();
    const customerToken = await registerAndLoginCustomer('rzp-refund@test.com');
    const customer = (req) => req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${customerToken}`);

    await customer(request(app).post('/api/v1/customer/cart/items')).send({
      productId: product._id,
      sku: product.variants[0].sku,
      quantity: 1,
    });
    await customer(request(app).put('/api/v1/customer/checkout/shipping-address')).send({
      name: 'Refund Customer',
      phone: '9999999999',
      line1: '1 Test St',
      city: 'Chennai',
      state: 'TN',
      pincode: '600001',
    });
    const checkoutRes = await customer(request(app).post('/api/v1/customer/checkout')).send({ paymentMethod: 'razorpay' });
    razorpayOrderId = checkoutRes.body.data.razorpayOrderId;

    const razorpayPaymentId = 'pay_refund_test_1';
    const signature = crypto.createHmac('sha256', RZP_KEY_SECRET).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    const verifyRes = await customer(request(app).post('/api/v1/customer/checkout/verify-payment')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: signature,
    });
    const orderId = verifyRes.body.data._id;

    const refundRes = await owner(request(app).post(`/api/v1/client-admin/orders/${orderId}/refund`)).send({
      reason: 'Product defect',
    });
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.data.refund.razorpayRefundId).toMatch(/^rfnd_test_/);
    expect(refundRes.body.data.refund.amount).toBe(249);
  });

  test('the reconciliation report shows captured and refunded totals for this tenant', async () => {
    const res = await owner(request(app).get('/api/v1/client-admin/reports/reconciliation'));
    expect(res.status).toBe(200);
    expect(res.body.data.ordersCount).toBeGreaterThanOrEqual(2);
    expect(res.body.data.refundsCount).toBeGreaterThanOrEqual(2);
    expect(res.body.data.refundedAmount).toBeGreaterThanOrEqual(498);
    expect(res.body.data.capturedAmount).toBeGreaterThanOrEqual(res.body.data.refundedAmount);
    expect(res.body.data.netAmount).toBe(res.body.data.capturedAmount - res.body.data.refundedAmount);
  });
});

describe('Flow A: Super Admin reconciliation summary', () => {
  let rootAdminToken;

  beforeAll(async () => {
    rootAdminToken = (
      await request(app).post('/api/v1/super-admin/auth/login').send({ email: 'root@platform.test', password: 'Password123!' })
    ).body.data.accessToken;

    const plan = await SubscriptionPlan.create({ name: 'Reconciliation Plan', pricing: { monthly: 50000 }, isActive: true });
    await root(request(app).post(`/api/v1/super-admin/clients/${acme._id}/subscription/plan`), rootAdminToken).send({
      planId: String(plan._id),
      billingCycle: 'monthly',
    });

    const checkoutRes = await root(
      request(app).post('/api/v1/client-admin/subscription/checkout'),
      ownerToken
    ).send({ billingCycle: 'monthly' });
    const { razorpayOrderId } = checkoutRes.body.data;
    const razorpayPaymentId = 'pay_platform_reconciliation_1';
    const platformSecret = 'demo_secret'; // must match .env's demo RAZORPAY_PLATFORM_KEY_SECRET
    const signature = crypto.createHmac('sha256', platformSecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    await owner(request(app).post('/api/v1/client-admin/subscription/verify-payment')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: signature,
    });
  });

  test('reconciliation summary reflects the paid invoice', async () => {
    const res = await root(request(app).get('/api/v1/super-admin/billing/reconciliation'), rootAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.data.paid.count).toBeGreaterThanOrEqual(1);
    expect(res.body.data.paid.amount).toBeGreaterThanOrEqual(50000);
  });

  test('non-super-admin cannot access the reconciliation summary', async () => {
    const res = await owner(request(app).get('/api/v1/super-admin/billing/reconciliation'));
    expect(res.status).toBe(403);
  });
});
