jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let Customer;
let Order;
let hashPassword;
let runAcrossAllTenants;

let productId;
let customerToken;
let customerId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ Customer } = require('../src/models/customer.model'));
  ({ Order } = require('../src/models/order.model'));
  ({ hashPassword } = require('../src/utils/password'));
  ({ runAcrossAllTenants } = require('../src/services/superAdmin/crossTenantAccess'));

  await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
  });
  const tenant = await Tenant.findOne({ 'domain.subdomain': 'acme' });

  const passwordHash = await hashPassword('Password123!');
  await User.create({ role: 'owner', tenantId: tenant._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });

  app = require('../src/app');

  const ownerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'Password123!' })
  ).body.data.accessToken;

  const catRes = await request(app)
    .post('/api/v1/client-admin/categories')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'GDPR Category' });
  const productRes = await request(app)
    .post('/api/v1/client-admin/products')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      name: 'GDPR Widget',
      category: catRes.body.data._id,
      variants: [{ sku: 'GDPR-1', price: 100, stock: 10 }],
      status: 'published',
    });
  productId = productRes.body.data._id;

  await request(app)
    .post('/api/v1/customer/auth/register')
    .set('Host', 'acme.myplatform.test')
    .send({ name: 'GDPR Customer', email: 'gdpr-customer@test.com', password: 'Password123!' });
  customerToken = (
    await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'gdpr-customer@test.com', password: 'Password123!' })
  ).body.data.accessToken;

  const customerDoc = await runAcrossAllTenants(() => Customer.findOne({ email: 'gdpr-customer@test.com' }).lean());
  customerId = customerDoc._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function customer(req) {
  return req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${customerToken}`);
}

describe('GDPR data export and account deletion', () => {
  let orderId;

  test('customer can export all of their own data', async () => {
    await customer(request(app).post('/api/v1/customer/wishlist')).send({ productId });
    await customer(request(app).post('/api/v1/customer/cart/items')).send({ productId, sku: 'GDPR-1', quantity: 1 });
    await customer(request(app).put('/api/v1/customer/checkout/shipping-address')).send({
      name: 'GDPR Customer',
      phone: '9999999999',
      line1: '1 Test St',
      city: 'Chennai',
      state: 'TN',
      pincode: '600001',
    });
    const checkoutRes = await customer(request(app).post('/api/v1/customer/checkout')).send({ paymentMethod: 'cod' });
    orderId = checkoutRes.body.data.order._id;

    const res = await customer(request(app).get('/api/v1/customer/account/export'));
    expect(res.status).toBe(200);
    expect(res.body.data.profile.email).toBe('gdpr-customer@test.com');
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.data.wishlist).toHaveLength(1);
  });

  test('deleting the account anonymizes the customer and scrubs order shipping PII, but keeps the transactional record', async () => {
    const res = await customer(request(app).delete('/api/v1/customer/account'));
    expect(res.status).toBe(200);

    const customerDoc = await runAcrossAllTenants(() => Customer.findById(customerId).lean());
    expect(customerDoc.status).toBe('deleted');
    expect(customerDoc.email).not.toBe('gdpr-customer@test.com');
    expect(customerDoc.name).toBe('Deleted Customer');
    expect(customerDoc.addresses).toHaveLength(0);

    const orderDoc = await runAcrossAllTenants(() => Order.findById(orderId).lean());
    expect(orderDoc.shippingAddress.name).toBe('[deleted]');
    // The financial record itself survives untouched.
    expect(orderDoc.pricing.grandTotal).toBeGreaterThan(0);
    expect(orderDoc.orderNumber).toBeTruthy();
  });

  test('the deleted account can no longer log in', async () => {
    const res = await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'gdpr-customer@test.com', password: 'Password123!' });
    expect(res.status).toBe(401);
  });
});
