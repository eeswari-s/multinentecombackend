jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let hashPassword;

let acmeOwnerToken;
let acmeSupportToken;
let globexOwnerToken;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ hashPassword } = require('../src/utils/password'));

  const acme = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
  });
  const globex = await Tenant.create({
    businessName: 'Globex Traders',
    contactEmail: 'contact@globex.test',
    domain: { subdomain: 'globex' },
    status: 'active',
  });

  const passwordHash = await hashPassword('Password123!');

  await User.create({ role: 'owner', tenantId: acme._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });
  await User.create({
    role: 'support_staff',
    tenantId: acme._id,
    name: 'Acme Support',
    email: 'support@acme.test',
    passwordHash,
  });
  await User.create({ role: 'owner', tenantId: globex._id, name: 'Globex Owner', email: 'owner@globex.test', passwordHash });

  app = require('../src/app');

  // Mongoose's autoIndex builds indexes in the background after each model
  // is registered — including the unique variants.sku index and Product's
  // $text index this file's tests depend on. Waiting for every model here
  // avoids an index-not-ready race that otherwise only shows up under load
  // (e.g. running alongside other test files), not when this file runs alone.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const login = (host, email) =>
    request(app).post('/api/v1/client-admin/auth/login').set('Host', host).send({ email, password: 'Password123!' });

  acmeOwnerToken = (await login('acme.myplatform.test', 'owner@acme.test')).body.data.accessToken;
  acmeSupportToken = (await login('acme.myplatform.test', 'support@acme.test')).body.data.accessToken;
  globexOwnerToken = (await login('globex.myplatform.test', 'owner@globex.test')).body.data.accessToken;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function acme(req) {
  return req.set('Authorization', `Bearer ${acmeOwnerToken}`);
}
function acmeSupport(req) {
  return req.set('Authorization', `Bearer ${acmeSupportToken}`);
}
function globexReq(req) {
  return req.set('Authorization', `Bearer ${globexOwnerToken}`);
}

describe('Category management', () => {
  let categoryId;

  test('owner creates a category', async () => {
    const res = await acme(request(app).post('/api/v1/client-admin/categories')).send({
      name: 'Snacks',
      description: 'Snack foods',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('snacks');
    categoryId = res.body.data._id;
  });

  test('lists and fetches the category', async () => {
    const listRes = await acme(request(app).get('/api/v1/client-admin/categories'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((c) => c._id === categoryId)).toBe(true);

    const getRes = await acme(request(app).get(`/api/v1/client-admin/categories/${categoryId}`));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe('Snacks');
  });

  test("Globex cannot see Acme's category", async () => {
    const res = await globexReq(request(app).get(`/api/v1/client-admin/categories/${categoryId}`));
    expect(res.status).toBe(404);
  });

  test('renaming regenerates a unique slug', async () => {
    const res = await acme(request(app).patch(`/api/v1/client-admin/categories/${categoryId}`)).send({
      name: 'Premium Snacks',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('premium-snacks');
  });

  test('support_staff can read but not write categories', async () => {
    const readRes = await acmeSupport(request(app).get('/api/v1/client-admin/categories'));
    expect(readRes.status).toBe(200);

    const writeRes = await acmeSupport(request(app).post('/api/v1/client-admin/categories')).send({
      name: 'Should Fail',
    });
    expect(writeRes.status).toBe(403);
  });

  test('cannot delete a category that still has products assigned', async () => {
    const productRes = await acme(request(app).post('/api/v1/client-admin/products')).send({
      name: 'Temp Product For Category Guard',
      category: categoryId,
      variants: [{ sku: 'GUARD-1', price: 100, stock: 5 }],
    });
    expect(productRes.status).toBe(201);

    const deleteRes = await acme(request(app).delete(`/api/v1/client-admin/categories/${categoryId}`));
    expect(deleteRes.status).toBe(409);
  });
});

describe('Product management', () => {
  let categoryId;
  let productId;

  beforeAll(async () => {
    const res = await acme(request(app).post('/api/v1/client-admin/categories')).send({ name: 'Beverages' });
    categoryId = res.body.data._id;
  });

  test('creates a product with multiple variants and computes denormalized fields', async () => {
    const res = await acme(request(app).post('/api/v1/client-admin/products')).send({
      name: 'Cold Brew Coffee',
      category: categoryId,
      brand: 'Acme',
      tags: ['coffee', 'cold-brew'],
      variants: [
        { sku: 'CB-250', attributes: { size: '250ml' }, price: 199, stock: 10 },
        { sku: 'CB-500', attributes: { size: '500ml' }, price: 349, offerPrice: 299, stock: 5 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('cold-brew-coffee');
    expect(res.body.data.priceRange).toEqual({ min: 199, max: 299 });
    expect(res.body.data.totalStock).toBe(15);

    productId = res.body.data._id;
  });

  test('rejects a duplicate SKU across products', async () => {
    const res = await acme(request(app).post('/api/v1/client-admin/products')).send({
      name: 'Another Product',
      category: categoryId,
      variants: [{ sku: 'CB-250', price: 100, stock: 1 }],
    });
    expect(res.status).toBe(409);
  });

  test('lists products filtered by category, status, price and text search', async () => {
    await acme(request(app).patch(`/api/v1/client-admin/products/${productId}/status`)).send({
      status: 'published',
    });

    const res = await acme(
      request(app).get('/api/v1/client-admin/products').query({
        category: categoryId,
        status: 'published',
        minPrice: 150,
        maxPrice: 250,
        search: 'coffee',
      })
    );
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((p) => p._id === productId)).toBe(true);
  });

  test("a different tenant's product listing never includes Acme's products", async () => {
    const res = await globexReq(request(app).get('/api/v1/client-admin/products'));
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((p) => p._id === productId)).toBe(false);
  });

  test('duplicates a product with fresh SKUs and zeroed stock', async () => {
    const res = await acme(request(app).post(`/api/v1/client-admin/products/${productId}/duplicate`));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.totalStock).toBe(0);
    expect(res.body.data.variants.every((v) => v.sku !== 'CB-250' && v.sku !== 'CB-500')).toBe(true);
  });

  test('bulk status update applies to multiple products', async () => {
    const secondProduct = await acme(request(app).post('/api/v1/client-admin/products')).send({
      name: 'Iced Tea',
      category: categoryId,
      variants: [{ sku: 'IT-1', price: 149, stock: 20 }],
    });

    const res = await acme(request(app).patch('/api/v1/client-admin/products/bulk/status')).send({
      ids: [productId, secondProduct.body.data._id],
      status: 'archived',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.matched).toBe(2);

    const getRes = await acme(request(app).get(`/api/v1/client-admin/products/${productId}`));
    expect(getRes.body.data.status).toBe('archived');
  });

  test('support_staff cannot create or update products', async () => {
    const res = await acmeSupport(request(app).post('/api/v1/client-admin/products')).send({
      name: 'Should Fail',
      category: categoryId,
      variants: [{ sku: 'FAIL-1', price: 10, stock: 1 }],
    });
    expect(res.status).toBe(403);
  });
});

describe('Inventory management', () => {
  let categoryId;
  let productId;

  beforeAll(async () => {
    const catRes = await acme(request(app).post('/api/v1/client-admin/categories')).send({ name: 'Inventory Test' });
    categoryId = catRes.body.data._id;

    const productRes = await acme(request(app).post('/api/v1/client-admin/products')).send({
      name: 'Stock Test Widget',
      category: categoryId,
      variants: [{ sku: 'STOCK-1', price: 50, stock: 10 }],
    });
    productId = productRes.body.data._id;
  });

  test('restocking increases stock and is recorded in the ledger', async () => {
    const res = await acme(request(app).post('/api/v1/client-admin/inventory/adjust')).send({
      productId,
      sku: 'STOCK-1',
      quantityChange: 20,
      type: 'restock',
      reason: 'Supplier delivery',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.resultingStock).toBe(30);

    const movements = await acme(request(app).get('/api/v1/client-admin/inventory').query({ productId }));
    expect(movements.body.data.total).toBe(1);
    expect(movements.body.data.items[0].type).toBe('restock');
  });

  test('a sale cannot drive stock negative', async () => {
    const res = await acme(request(app).post('/api/v1/client-admin/inventory/adjust')).send({
      productId,
      sku: 'STOCK-1',
      quantityChange: -1000,
      type: 'sale',
    });
    expect(res.status).toBe(400);
  });

  test('a valid sale decrements stock atomically, and keeps the denormalized totalStock in sync', async () => {
    const res = await acme(request(app).post('/api/v1/client-admin/inventory/adjust')).send({
      productId,
      sku: 'STOCK-1',
      quantityChange: -5,
      type: 'sale',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.resultingStock).toBe(25);

    // adjustStock uses a raw findOneAndUpdate($inc), which bypasses the
    // pre('validate') hook that normally recomputes totalStock — confirmed
    // separately as a real bug where this field silently went stale after
    // every stock adjustment. This asserts the fix keeps it in sync.
    const productRes = await acme(request(app).get(`/api/v1/client-admin/products/${productId}`));
    expect(productRes.body.data.totalStock).toBe(25);
  });
});
