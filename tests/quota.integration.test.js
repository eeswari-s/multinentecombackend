jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let SubscriptionPlan;
let hashPassword;
let requestContext;
let uploadService;

let tenantId;
let rootAdminToken;
let ownerToken;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ SubscriptionPlan } = require('../src/models/subscriptionPlan.model'));
  ({ hashPassword } = require('../src/utils/password'));
  requestContext = require('../src/utils/requestContext');
  uploadService = require('../src/integrations/cloudinary/uploadService');

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

  rootAdminToken = (
    await request(app).post('/api/v1/super-admin/auth/login').send({ email: 'root@platform.test', password: 'Password123!' })
  ).body.data.accessToken;
  ownerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'Password123!' })
  ).body.data.accessToken;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function root(req) {
  return req.set('Authorization', `Bearer ${rootAdminToken}`);
}
function owner(req) {
  return req.set('Authorization', `Bearer ${ownerToken}`);
}

async function assignPlanWithLimits(limits) {
  const planRes = await root(request(app).post('/api/v1/super-admin/plans')).send({
    name: `Plan ${Date.now()}`,
    pricing: { monthly: 10000 },
    limits,
  });
  const planId = planRes.body.data._id;

  await root(request(app).post(`/api/v1/super-admin/clients/${tenantId}/subscription/plan`)).send({
    planId,
    billingCycle: 'monthly',
  });
  return planId;
}

describe('Super Admin: subscription plan catalog', () => {
  test('creates, lists, fetches, and updates a plan', async () => {
    const createRes = await root(request(app).post('/api/v1/super-admin/plans')).send({
      name: 'Growth',
      description: 'For growing stores',
      pricing: { monthly: 199900, yearly: 1999900 },
      limits: { maxProducts: 500 },
      features: ['analytics', 'custom-domain'],
    });
    expect(createRes.status).toBe(201);
    const planId = createRes.body.data._id;

    const listRes = await root(request(app).get('/api/v1/super-admin/plans'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((p) => p._id === planId)).toBe(true);

    const getRes = await root(request(app).get(`/api/v1/super-admin/plans/${planId}`));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe('Growth');

    const updateRes = await root(request(app).patch(`/api/v1/super-admin/plans/${planId}`)).send({
      limits: { maxProducts: 1000 },
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.limits.maxProducts).toBe(1000);
  });

  test('non-super-admin cannot manage plans', async () => {
    const res = await owner(request(app).get('/api/v1/super-admin/plans'));
    expect(res.status).toBe(403);
  });
});

describe('Plan-tier quota enforcement', () => {
  test('product quota blocks creation past the plan limit', async () => {
    await assignPlanWithLimits({ maxProducts: 1 });

    const catRes = await owner(request(app).post('/api/v1/client-admin/categories')).send({ name: 'Quota Category' });
    const categoryId = catRes.body.data._id;

    const firstRes = await owner(request(app).post('/api/v1/client-admin/products')).send({
      name: 'Quota Product 1',
      category: categoryId,
      variants: [{ sku: 'QUOTA-1', price: 100, stock: 5 }],
    });
    expect(firstRes.status).toBe(201);

    const secondRes = await owner(request(app).post('/api/v1/client-admin/products')).send({
      name: 'Quota Product 2',
      category: categoryId,
      variants: [{ sku: 'QUOTA-2', price: 100, stock: 5 }],
    });
    expect(secondRes.status).toBe(403);
  });

  test('staff quota blocks inviting past the plan limit', async () => {
    await assignPlanWithLimits({ maxStaffUsers: 1 });

    const firstRes = await owner(request(app).post('/api/v1/client-admin/staff')).send({
      name: 'Staff One',
      email: 'staff-one@acme.test',
      role: 'manager',
      password: 'Password123!',
    });
    expect(firstRes.status).toBe(201);

    const secondRes = await owner(request(app).post('/api/v1/client-admin/staff')).send({
      name: 'Staff Two',
      email: 'staff-two@acme.test',
      role: 'manager',
      password: 'Password123!',
    });
    expect(secondRes.status).toBe(403);
  });

  test('order quota blocks checkout past the monthly plan limit', async () => {
    await assignPlanWithLimits({ maxOrdersPerMonth: 1 });

    const catRes = await owner(request(app).post('/api/v1/client-admin/categories')).send({ name: 'Order Quota Category' });
    const productRes = await owner(request(app).post('/api/v1/client-admin/products')).send({
      name: 'Order Quota Product',
      category: catRes.body.data._id,
      variants: [{ sku: 'ORDERQUOTA-1', price: 100, stock: 10 }],
      status: 'published',
    });
    const productId = productRes.body.data._id;

    await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Quota Customer', email: 'quota-customer@test.com', password: 'Password123!' });
    const customerToken = (
      await request(app)
        .post('/api/v1/customer/auth/login')
        .set('Host', 'acme.myplatform.test')
        .send({ email: 'quota-customer@test.com', password: 'Password123!' })
    ).body.data.accessToken;
    const customer = (req) => req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${customerToken}`);

    async function placeOrder(sku) {
      await customer(request(app).post('/api/v1/customer/cart/items')).send({ productId, sku, quantity: 1 });
      await customer(request(app).put('/api/v1/customer/checkout/shipping-address')).send({
        name: 'Quota Customer',
        phone: '9999999999',
        line1: '1 Test St',
        city: 'Chennai',
        state: 'TN',
        pincode: '600001',
      });
      return customer(request(app).post('/api/v1/customer/checkout')).send({ paymentMethod: 'cod' });
    }

    const firstOrder = await placeOrder('ORDERQUOTA-1');
    expect(firstOrder.status).toBe(200);

    const secondOrder = await placeOrder('ORDERQUOTA-1');
    expect(secondOrder.status).toBe(403);
  });

  test('storage quota blocks an upload that would exceed the plan limit', async () => {
    await assignPlanWithLimits({ maxStorageMB: 0 }); // 0 MB effectively means "no room at all"

    await requestContext.run({ tenantId, tenant: { _id: tenantId } }, async () => {
      await expect(uploadService.uploadBuffer(Buffer.from('a tiny test image'), `tenants/${tenantId}/test`)).rejects.toThrow(
        /storage quota/i
      );
    });
  });

  test('a plan with no configured limit does not block anything', async () => {
    await assignPlanWithLimits({}); // no limits set at all

    const catRes = await owner(request(app).post('/api/v1/client-admin/categories')).send({ name: 'Unlimited Category' });
    const res = await owner(request(app).post('/api/v1/client-admin/products')).send({
      name: 'Unlimited Product',
      category: catRes.body.data._id,
      variants: [{ sku: 'UNLIMITED-1', price: 100, stock: 5 }],
    });
    expect(res.status).toBe(201);
  });
});
