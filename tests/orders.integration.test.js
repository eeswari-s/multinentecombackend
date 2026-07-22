jest.mock('ioredis', () => require('ioredis-mock'));

// Mocking our own thin wrapper (rather than the raw `razorpay` package)
// avoids a real network call for orders.create while keeping
// getTenantWebhookSecret real, since the webhook tests need genuine
// decryption of the tenant's configured webhook secret.
jest.mock('../src/integrations/razorpay/tenantClient', () => {
  const actual = jest.requireActual('../src/integrations/razorpay/tenantClient');
  let counter = 0;
  return {
    ...actual,
    getTenantRazorpayClient: jest.fn().mockResolvedValue({
      orders: {
        // A unique id per call matters: two different tests' checkouts
        // must not collide on razorpay.orderId within the same tenant,
        // or the webhook/verify-payment lookup can match the wrong order.
        create: jest.fn().mockImplementation(() => {
          counter += 1;
          return Promise.resolve({ id: `order_test_mocked_${counter}`, amount: 100, currency: 'INR' });
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
let Product;
let Order;
let hashPassword;
let runAcrossAllTenants;

// Direct model reads below (outside any HTTP request) have no
// AsyncLocalStorage tenant context, since that's only established by
// tenantResolver middleware during a real request — the Super Admin
// cross-tenant bypass is the correct, honest way to run them here.
function readProduct(id) {
  return runAcrossAllTenants(() => Product.findById(id).lean());
}
function readOrder(filter) {
  return runAcrossAllTenants(() => Order.findOne(filter).lean());
}

let acmeId;
let ownerToken;
const RZP_KEY_SECRET = 'fake_test_key_secret';
const RZP_WEBHOOK_SECRET = 'fake_test_webhook_secret';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ Product } = require('../src/models/product.model'));
  ({ Order } = require('../src/models/order.model'));
  ({ hashPassword } = require('../src/utils/password'));
  ({ runAcrossAllTenants } = require('../src/services/superAdmin/crossTenantAccess'));

  const acme = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
    invoicePrefix: 'ACME',
  });
  acmeId = String(acme._id);

  const globex = await Tenant.create({
    businessName: 'Globex Traders',
    contactEmail: 'contact@globex.test',
    domain: { subdomain: 'globex' },
    status: 'active',
  });

  const passwordHash = await hashPassword('Password123!');
  await User.create({ role: 'owner', tenantId: acme._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });
  await User.create({ role: 'owner', tenantId: globex._id, name: 'Globex Owner', email: 'owner@globex.test', passwordHash });

  app = require('../src/app');

  const ownerLogin = await request(app)
    .post('/api/v1/client-admin/auth/login')
    .set('Host', 'acme.myplatform.test')
    .send({ email: 'owner@acme.test', password: 'Password123!' });
  ownerToken = ownerLogin.body.data.accessToken;

  await request(app)
    .put('/api/v1/client-admin/razorpay-config')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ keyId: 'rzp_test_fake', keySecret: RZP_KEY_SECRET, webhookSecret: RZP_WEBHOOK_SECRET });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function admin(req) {
  return req.set('Authorization', `Bearer ${ownerToken}`);
}

async function createCategoryAndProduct(overrides = {}) {
  const catRes = await admin(request(app).post('/api/v1/client-admin/categories')).send({
    name: overrides.categoryName || `Cat-${Date.now()}`,
  });
  const categoryId = catRes.body.data._id;

  const productRes = await admin(request(app).post('/api/v1/client-admin/products')).send({
    name: overrides.productName || 'Order Test Widget',
    category: categoryId,
    variants: [{ sku: overrides.sku || `SKU-${Date.now()}`, price: 500, stock: overrides.stock ?? 10 }],
    status: 'published',
  });
  return productRes.body.data;
}

async function registerAndLoginCustomer(host, email) {
  await request(app)
    .post('/api/v1/customer/auth/register')
    .set('Host', host)
    .send({ name: 'Test Customer', email, password: 'Password123!' });

  const loginRes = await request(app)
    .post('/api/v1/customer/auth/login')
    .set('Host', host)
    .send({ email, password: 'Password123!' });

  return loginRes.body.data.accessToken;
}

const shippingAddress = {
  name: 'Test Customer',
  phone: '9999999999',
  line1: '123 Test Street',
  city: 'Chennai',
  state: 'TN',
  pincode: '600001',
};

describe('Cart', () => {
  test('add item, update quantity, and pricing recomputes', async () => {
    const product = await createCategoryAndProduct({ sku: 'CART-1' });
    const token = await registerAndLoginCustomer('acme.myplatform.test', 'cart-customer@test.com');

    const addRes = await request(app)
      .post('/api/v1/customer/cart/items')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, sku: 'CART-1', quantity: 2 });

    expect(addRes.status).toBe(200);
    expect(addRes.body.data.pricing.itemsTotal).toBe(1000);

    const itemId = addRes.body.data.items[0]._id;
    const updateRes = await request(app)
      .patch(`/api/v1/customer/cart/items/${itemId}`)
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 3 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.pricing.itemsTotal).toBe(1500);
  });

  test('cannot add more than available stock', async () => {
    const product = await createCategoryAndProduct({ sku: 'CART-LOW-STOCK', stock: 1 });
    const token = await registerAndLoginCustomer('acme.myplatform.test', 'lowstock-customer@test.com');

    const res = await request(app)
      .post('/api/v1/customer/cart/items')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, sku: 'CART-LOW-STOCK', quantity: 5 });

    expect(res.status).toBe(400);
  });
});

describe('COD checkout', () => {
  test('confirms immediately, decrements stock, assigns sequential invoice/order numbers', async () => {
    const product = await createCategoryAndProduct({ sku: 'COD-1', stock: 10 });
    const token = await registerAndLoginCustomer('acme.myplatform.test', 'cod-customer@test.com');

    await request(app)
      .post('/api/v1/customer/cart/items')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, sku: 'COD-1', quantity: 2 });

    await request(app)
      .put('/api/v1/customer/checkout/shipping-address')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send(shippingAddress);

    const checkoutRes = await request(app)
      .post('/api/v1/customer/checkout')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentMethod: 'cod' });

    expect(checkoutRes.status).toBe(200);
    const order = checkoutRes.body.data.order;
    expect(order.status).toBe('confirmed');
    expect(order.invoiceNumber).toMatch(/^ACME-\d{6}$/);
    expect(order.orderNumber).toMatch(/^ORD-\d{6}$/);

    const productAfter = await readProduct(product._id);
    expect(productAfter.variants[0].stock).toBe(8);
  });
});

describe('Razorpay checkout (Flow B)', () => {
  test('creates a Razorpay order scoped to the tenant, then confirms on valid payment signature', async () => {
    const product = await createCategoryAndProduct({ sku: 'RZP-1', stock: 10 });
    const token = await registerAndLoginCustomer('acme.myplatform.test', 'rzp-customer@test.com');

    await request(app)
      .post('/api/v1/customer/cart/items')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, sku: 'RZP-1', quantity: 1 });

    await request(app)
      .put('/api/v1/customer/checkout/shipping-address')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send(shippingAddress);

    const checkoutRes = await request(app)
      .post('/api/v1/customer/checkout')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentMethod: 'razorpay' });

    expect(checkoutRes.status).toBe(200);
    expect(checkoutRes.body.data.razorpayOrderId).toMatch(/^order_test_mocked_\d+$/);

    const razorpayOrderId = checkoutRes.body.data.razorpayOrderId;
    const razorpayPaymentId = 'pay_test_mocked_456';
    const validSignature = crypto
      .createHmac('sha256', RZP_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const badVerify = await request(app)
      .post('/api/v1/customer/checkout/verify-payment')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ razorpayOrderId, razorpayPaymentId, razorpaySignature: 'not-a-valid-signature-hex-00' });
    expect(badVerify.status).toBe(401);

    const goodVerify = await request(app)
      .post('/api/v1/customer/checkout/verify-payment')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ razorpayOrderId, razorpayPaymentId, razorpaySignature: validSignature });

    expect(goodVerify.status).toBe(200);
    expect(goodVerify.body.data.status).toBe('confirmed');
    expect(goodVerify.body.data.paymentStatus).toBe('paid');
  });
});

describe('Razorpay webhook handling', () => {
  test('confirms a pending order idempotently on payment.captured, ignoring a bad signature', async () => {
    const product = await createCategoryAndProduct({ sku: 'WEBHOOK-1', stock: 10 });
    const token = await registerAndLoginCustomer('acme.myplatform.test', 'webhook-customer@test.com');

    await request(app)
      .post('/api/v1/customer/cart/items')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, sku: 'WEBHOOK-1', quantity: 1 });

    await request(app)
      .put('/api/v1/customer/checkout/shipping-address')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send(shippingAddress);

    const checkoutRes = await request(app)
      .post('/api/v1/customer/checkout')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentMethod: 'razorpay' });

    const razorpayOrderId = checkoutRes.body.data.razorpayOrderId;
    const webhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_webhook_1', order_id: razorpayOrderId } } },
    });

    const badSigRes = await request(app)
      .post(`/api/v1/webhooks/razorpay/${acmeId}`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'deadbeef')
      .send(webhookPayload);
    expect(badSigRes.status).toBe(400);

    const validSig = crypto.createHmac('sha256', RZP_WEBHOOK_SECRET).update(webhookPayload).digest('hex');

    const firstRes = await request(app)
      .post(`/api/v1/webhooks/razorpay/${acmeId}`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validSig)
      .send(webhookPayload);
    expect(firstRes.status).toBe(200);

    const orderAfterFirst = await readOrder({ 'razorpay.orderId': razorpayOrderId });
    expect(orderAfterFirst.status).toBe('confirmed');
    const stockAfterFirst = (await readProduct(product._id)).variants[0].stock;
    expect(stockAfterFirst).toBe(9);

    // Razorpay retries webhooks — a second identical delivery must not
    // double-confirm the order or double-decrement stock.
    const secondRes = await request(app)
      .post(`/api/v1/webhooks/razorpay/${acmeId}`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validSig)
      .send(webhookPayload);
    expect(secondRes.status).toBe(200);

    const stockAfterSecond = (await readProduct(product._id)).variants[0].stock;
    expect(stockAfterSecond).toBe(9);
  });
});

describe('Order management and tenant isolation', () => {
  test('admin can progress order status and cancelling restocks inventory', async () => {
    const product = await createCategoryAndProduct({ sku: 'ADMIN-ORD-1', stock: 10 });
    const token = await registerAndLoginCustomer('acme.myplatform.test', 'admin-order-customer@test.com');

    await request(app)
      .post('/api/v1/customer/cart/items')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id, sku: 'ADMIN-ORD-1', quantity: 2 });
    await request(app)
      .put('/api/v1/customer/checkout/shipping-address')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send(shippingAddress);
    const checkoutRes = await request(app)
      .post('/api/v1/customer/checkout')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentMethod: 'cod' });

    const orderId = checkoutRes.body.data.order._id;

    const toProcessing = await admin(
      request(app).patch(`/api/v1/client-admin/orders/${orderId}/status`)
    ).send({ status: 'processing' });
    expect(toProcessing.status).toBe(200);

    const invalidSkip = await admin(
      request(app).patch(`/api/v1/client-admin/orders/${orderId}/status`)
    ).send({ status: 'delivered' });
    expect(invalidSkip.status).toBe(400);

    const toCancelled = await admin(
      request(app).patch(`/api/v1/client-admin/orders/${orderId}/status`)
    ).send({ status: 'cancelled' });
    expect(toCancelled.status).toBe(200);

    const productAfter = await readProduct(product._id);
    expect(productAfter.variants[0].stock).toBe(10);
  });

  test("a tenant's order list never includes another tenant's orders", async () => {
    const globexLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'globex.myplatform.test')
      .send({ email: 'owner@globex.test', password: 'Password123!' });
    const globexToken = globexLogin.body.data.accessToken;

    const res = await request(app)
      .get('/api/v1/client-admin/orders')
      .set('Authorization', `Bearer ${globexToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });
});
