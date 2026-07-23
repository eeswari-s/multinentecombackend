jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let AnalyticsEvent;
let AnalyticsRollup;
let Order;
let hashPassword;
let requestContext;
let runAcrossAllTenants;
let runRollup;
let computePeriodBounds;

let tenant;
let ownerToken;
let impersonationToken;
let customerToken;
let productId;
let periodStart;
let periodEnd;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ AnalyticsEvent } = require('../src/models/analyticsEvent.model'));
  ({ AnalyticsRollup } = require('../src/models/analyticsRollup.model'));
  ({ Order } = require('../src/models/order.model'));
  ({ hashPassword } = require('../src/utils/password'));
  requestContext = require('../src/utils/requestContext');
  ({ runAcrossAllTenants } = require('../src/services/superAdmin/crossTenantAccess'));
  ({ runRollup, computePeriodBounds } = require('../src/services/analyticsRollupService'));

  tenant = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
  });

  const passwordHash = await hashPassword('Password123!');
  await User.create({ role: 'owner', tenantId: tenant._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });
  await User.create({ role: 'super_admin', name: 'Root Admin', email: 'root@platform.test', passwordHash });

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

  // Analytics is platform-controlled (see rbac.js / permissions.js) — only
  // reachable via Super Admin's "Login As Client" impersonation.
  impersonationToken = (
    await request(app)
      .post(`/api/v1/super-admin/clients/${tenant._id}/login-as`)
      .set('Authorization', `Bearer ${rootToken}`)
  ).body.data.accessToken;

  const catRes = await request(app)
    .post('/api/v1/client-admin/categories')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Analytics Test Category' });
  const productRes = await request(app)
    .post('/api/v1/client-admin/products')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      name: 'Analytics Test Widget',
      category: catRes.body.data._id,
      variants: [{ sku: 'ANALYTICS-1', price: 100, stock: 20 }],
      status: 'published',
    });
  productId = productRes.body.data._id;

  await request(app)
    .post('/api/v1/customer/auth/register')
    .set('Host', 'acme.myplatform.test')
    .send({ name: 'Analytics Customer', email: 'analytics-customer@test.com', password: 'Password123!' });
  customerToken = (
    await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'analytics-customer@test.com', password: 'Password123!' })
  ).body.data.accessToken;

  ({ periodStart, periodEnd } = computePeriodBounds('daily', new Date()));

  // Seed raw analytics events directly (the queue/worker path can't run in
  // tests — BullMQ needs real Redis Lua/msgpack support ioredis-mock lacks,
  // confirmed separately). This exercises the real rollup aggregation
  // logic against real data, which is the part worth testing here.
  await requestContext.run({ tenantId: String(tenant._id), tenant: tenant.toObject() }, async () => {
    // createdAt is set explicitly per event, at insert time — Mongoose's
    // timestamps plugin only auto-populates createdAt when it's absent, so
    // this backdates the fixtures into the rollup's target period. (A later
    // $set update would NOT work: Mongoose silently strips `createdAt` out
    // of update payloads by design, confirmed separately.)
    const withinPeriod = new Date(periodStart.getTime() + 60 * 60 * 1000);
    const events = [
      { type: 'product_view', productId, sessionId: 'sess-1', device: 'mobile', browser: 'chrome', country: 'IN', trafficSource: 'direct', viewDurationMs: 4000, createdAt: withinPeriod },
      { type: 'product_view', productId, sessionId: 'sess-1', device: 'mobile', browser: 'chrome', country: 'IN', trafficSource: 'direct', viewDurationMs: 2000, createdAt: withinPeriod },
      { type: 'product_view', productId, sessionId: 'sess-2', device: 'desktop', browser: 'firefox', country: 'US', trafficSource: 'google', viewDurationMs: 6000, createdAt: withinPeriod },
      { type: 'product_share', productId, sessionId: 'sess-2', createdAt: withinPeriod },
      { type: 'wishlist_add', productId, sessionId: 'sess-2', createdAt: withinPeriod },
      { type: 'cart_add', productId, sessionId: 'sess-1', createdAt: withinPeriod },
      { type: 'search', sessionId: 'sess-1', searchQuery: 'widget', createdAt: withinPeriod },
      { type: 'page_view', sessionId: 'sess-1', createdAt: withinPeriod },
      { type: 'page_view', sessionId: 'sess-2', createdAt: withinPeriod },
    ];
    await AnalyticsEvent.insertMany(events);
  });

  // Confirmed order within the same period, for order/revenue/coupon metrics.
  await request(app)
    .post('/api/v1/customer/cart/items')
    .set('Host', 'acme.myplatform.test')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ productId, sku: 'ANALYTICS-1', quantity: 2 });
  await request(app)
    .put('/api/v1/customer/checkout/shipping-address')
    .set('Host', 'acme.myplatform.test')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ name: 'Analytics Customer', phone: '9999999999', line1: '1 Test St', city: 'Chennai', state: 'TN', pincode: '600001' });
  const checkoutRes = await request(app)
    .post('/api/v1/customer/checkout')
    .set('Host', 'acme.myplatform.test')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ paymentMethod: 'cod' });
  const orderId = checkoutRes.body.data.order._id;

  await requestContext.run({ tenantId: String(tenant._id), tenant: tenant.toObject() }, () =>
    Order.updateOne({ _id: orderId }, { $set: { confirmedAt: new Date(periodStart.getTime() + 60 * 60 * 1000) } })
  );

  await runRollup('daily');
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function admin(req) {
  return req.set('Authorization', `Bearer ${ownerToken}`);
}

describe('Analytics rollup', () => {
  test('builds a daily rollup document with correct product/device/order metrics', async () => {
    const rollup = await runAcrossAllTenants(() =>
      AnalyticsRollup.findOne({ granularity: 'daily', periodStart }).lean()
    );

    expect(rollup).not.toBeNull();

    const productEntry = rollup.productMetrics.find((p) => String(p.productId) === productId);
    expect(productEntry.views).toBe(3);
    expect(productEntry.uniqueViews).toBe(2); // sess-1 and sess-2
    expect(productEntry.shares).toBe(1);
    expect(productEntry.wishlistAdds).toBe(1);
    expect(productEntry.cartAdds).toBe(1);
    expect(productEntry.totalViewTimeMs).toBe(12000);
    expect(productEntry.unitsSold).toBe(2);
    expect(productEntry.salesRevenue).toBe(200);

    expect(rollup.deviceBreakdown.mobile).toBe(2);
    expect(rollup.deviceBreakdown.desktop).toBe(1);
    expect(rollup.totalSearches).toBe(1);
    expect(rollup.totalPageViews).toBe(2);
    expect(rollup.orderMetrics.totalOrders).toBe(1);
    // grandTotal = 200 item subtotal + 49 flat shipping (default settings, below the free-shipping threshold)
    expect(rollup.orderMetrics.totalRevenue).toBe(249);
  });

  test('re-running the rollup for the same period overwrites rather than duplicates', async () => {
    await runRollup('daily');
    const count = await runAcrossAllTenants(() => AnalyticsRollup.countDocuments({ granularity: 'daily', periodStart }));
    expect(count).toBe(1);
  });
});

describe('Analytics endpoints', () => {
  test('customer event tracking is accepted (queued) without blocking the request', async () => {
    const res = await request(app)
      .post('/api/v1/customer/analytics/track')
      .set('Host', 'acme.myplatform.test')
      .send({ events: [{ type: 'page_view', sessionId: 'sess-3' }] });
    expect(res.status).toBe(202);
  });

  test('owner can fetch the aggregated analytics summary via impersonation', async () => {
    const res = await request(app)
      .get('/api/v1/client-admin/analytics/summary')
      .set('Authorization', `Bearer ${impersonationToken}`)
      .query({
        granularity: 'daily',
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.orderMetrics.totalOrders).toBe(1);
    expect(res.body.data.products.mostViewed[0].productId).toBe(productId);
    expect(res.body.data.products.bestSelling[0].unitsSold).toBe(2);
    expect(res.body.data.conversionRate).toBeGreaterThan(0);
  });

  test('the analytics summary route requires authentication', async () => {
    const res = await request(app).get('/api/v1/client-admin/analytics/summary');
    expect(res.status).toBe(401);
  });
});
