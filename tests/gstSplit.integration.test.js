jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let hashPassword;

let ownerToken;
let productId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ hashPassword } = require('../src/utils/password'));

  // Seller is registered in Tamil Nadu — used to determine intra vs
  // inter-state for every test below.
  await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
    address: { line1: '1 Seller St', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    gst: { number: '33ABCDE1234F1Z5' },
  });
  const tenant = await Tenant.findOne({ 'domain.subdomain': 'acme' });

  const passwordHash = await hashPassword('Password123!');
  await User.create({ role: 'owner', tenantId: tenant._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });

  app = require('../src/app');

  ownerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'Password123!' })
  ).body.data.accessToken;

  const catRes = await request(app)
    .post('/api/v1/client-admin/categories')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'GST Test Category' });
  const productRes = await request(app)
    .post('/api/v1/client-admin/products')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      name: 'GST Test Widget',
      category: catRes.body.data._id,
      variants: [{ sku: 'GST-1', price: 1000, stock: 100 }],
      gst: { rate: 18 },
      status: 'published',
    });
  productId = productRes.body.data._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerAndLoginCustomer(email) {
  await request(app)
    .post('/api/v1/customer/auth/register')
    .set('Host', 'acme.myplatform.test')
    .send({ name: 'GST Customer', email, password: 'Password123!' });
  const login = await request(app)
    .post('/api/v1/customer/auth/login')
    .set('Host', 'acme.myplatform.test')
    .send({ email, password: 'Password123!' });
  return login.body.data.accessToken;
}

describe('GST split (CGST/SGST vs IGST)', () => {
  test('gstAmount is known from the cart alone, before any shipping address is set', async () => {
    const token = await registerAndLoginCustomer('gst-precheck@test.com');
    const customer = (req) => req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${token}`);

    const cartRes = await customer(request(app).post('/api/v1/customer/cart/items')).send({
      productId,
      sku: 'GST-1',
      quantity: 1,
    });
    // 1000 * 18% = 180 total GST, but no split yet since state isn't known
    expect(cartRes.body.data.pricing.gstAmount).toBe(180);
    expect(cartRes.body.data.pricing.cgstAmount).toBe(0);
    expect(cartRes.body.data.pricing.sgstAmount).toBe(0);
    expect(cartRes.body.data.pricing.igstAmount).toBe(0);
  });

  test('an intra-state order (same state as the seller) splits GST into CGST + SGST', async () => {
    const token = await registerAndLoginCustomer('gst-intrastate@test.com');
    const customer = (req) => req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${token}`);

    await customer(request(app).post('/api/v1/customer/cart/items')).send({ productId, sku: 'GST-1', quantity: 1 });
    const addressRes = await customer(request(app).put('/api/v1/customer/checkout/shipping-address')).send({
      name: 'GST Customer',
      phone: '9999999999',
      line1: '1 Buyer St',
      city: 'Coimbatore',
      state: 'Tamil Nadu', // same state as the seller
      pincode: '641001',
    });

    expect(addressRes.body.data.pricing.gstAmount).toBe(180);
    expect(addressRes.body.data.pricing.cgstAmount).toBe(90);
    expect(addressRes.body.data.pricing.sgstAmount).toBe(90);
    expect(addressRes.body.data.pricing.igstAmount).toBe(0);

    const checkoutRes = await customer(request(app).post('/api/v1/customer/checkout')).send({ paymentMethod: 'cod' });
    expect(checkoutRes.body.data.order.pricing.cgstAmount).toBe(90);
    expect(checkoutRes.body.data.order.pricing.sgstAmount).toBe(90);
  });

  test('an inter-state order (different state from the seller) charges IGST only', async () => {
    const token = await registerAndLoginCustomer('gst-interstate@test.com');
    const customer = (req) => req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${token}`);

    await customer(request(app).post('/api/v1/customer/cart/items')).send({ productId, sku: 'GST-1', quantity: 1 });
    const addressRes = await customer(request(app).put('/api/v1/customer/checkout/shipping-address')).send({
      name: 'GST Customer',
      phone: '9999999999',
      line1: '1 Buyer St',
      city: 'Mumbai',
      state: 'Maharashtra', // different state from the seller
      pincode: '400001',
    });

    expect(addressRes.body.data.pricing.gstAmount).toBe(180);
    expect(addressRes.body.data.pricing.cgstAmount).toBe(0);
    expect(addressRes.body.data.pricing.sgstAmount).toBe(0);
    expect(addressRes.body.data.pricing.igstAmount).toBe(180);
  });
});
