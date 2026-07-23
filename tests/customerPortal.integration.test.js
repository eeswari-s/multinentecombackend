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
let runAcrossAllTenants;

let acmeOwnerToken;
let acmeCustomerToken;
let acmeCategoryId;
let acmeProductA; // in-stock, published
let acmeProductB; // second product, same category, for "similar products"

let globexOwnerToken;
let globexCustomerToken;
let globexCategoryId;
let acmeImpersonationToken;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ Customer } = require('../src/models/customer.model'));
  ({ hashPassword } = require('../src/utils/password'));
  ({ runAcrossAllTenants } = require('../src/services/superAdmin/crossTenantAccess'));

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
  await User.create({ role: 'owner', tenantId: globex._id, name: 'Globex Owner', email: 'owner@globex.test', passwordHash });
  await User.create({ role: 'super_admin', name: 'Root Admin', email: 'root@platform.test', passwordHash });

  app = require('../src/app');
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  acmeOwnerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'Password123!' })
  ).body.data.accessToken;
  globexOwnerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'globex.myplatform.test')
      .send({ email: 'owner@globex.test', password: 'Password123!' })
  ).body.data.accessToken;

  const rootToken = (
    await request(app)
      .post('/api/v1/super-admin/auth/login')
      .send({ email: 'root@platform.test', password: 'Password123!' })
  ).body.data.accessToken;

  // Blog is platform-controlled (see rbac.js / permissions.js) — only
  // reachable via Super Admin's "Login As Client" impersonation.
  acmeImpersonationToken = (
    await request(app)
      .post(`/api/v1/super-admin/clients/${acme._id}/login-as`)
      .set('Authorization', `Bearer ${rootToken}`)
  ).body.data.accessToken;

  await request(app)
    .post('/api/v1/customer/auth/register')
    .set('Host', 'acme.myplatform.test')
    .send({ name: 'Acme Customer', email: 'customer@acme.test', password: 'Password123!' });
  acmeCustomerToken = (
    await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'customer@acme.test', password: 'Password123!' })
  ).body.data.accessToken;

  await request(app)
    .post('/api/v1/customer/auth/register')
    .set('Host', 'globex.myplatform.test')
    .send({ name: 'Globex Customer', email: 'customer@globex.test', password: 'Password123!' });
  globexCustomerToken = (
    await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'globex.myplatform.test')
      .send({ email: 'customer@globex.test', password: 'Password123!' })
  ).body.data.accessToken;

  const acmeCatRes = await acmeAdmin(request(app).post('/api/v1/client-admin/categories')).send({ name: 'Snacks' });
  acmeCategoryId = acmeCatRes.body.data._id;
  const globexCatRes = await globexAdmin(request(app).post('/api/v1/client-admin/categories')).send({ name: 'Tools' });
  globexCategoryId = globexCatRes.body.data._id;

  const productARes = await acmeAdmin(request(app).post('/api/v1/client-admin/products')).send({
    name: 'Chocolate Bar',
    brand: 'AcmeBrand',
    category: acmeCategoryId,
    variants: [{ sku: 'CHOC-1', price: 100, stock: 10 }],
    status: 'published',
    isFeatured: true,
  });
  acmeProductA = productARes.body.data;

  const productBRes = await acmeAdmin(request(app).post('/api/v1/client-admin/products')).send({
    name: 'Candy Pack',
    brand: 'AcmeBrand',
    category: acmeCategoryId,
    variants: [{ sku: 'CANDY-1', price: 50, stock: 0 }],
    status: 'published',
  });
  acmeProductB = productBRes.body.data;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function acmeAdmin(req) {
  return req.set('Authorization', `Bearer ${acmeOwnerToken}`);
}
function globexAdmin(req) {
  return req.set('Authorization', `Bearer ${globexOwnerToken}`);
}
function acmeImpersonating(req) {
  return req.set('Authorization', `Bearer ${acmeImpersonationToken}`);
}
function acmeCustomer(req) {
  return req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${acmeCustomerToken}`);
}
function globexCustomer(req) {
  return req.set('Host', 'globex.myplatform.test').set('Authorization', `Bearer ${globexCustomerToken}`);
}

describe('Customer home aggregator', () => {
  test('returns featured products and categories scoped to the tenant', async () => {
    const res = await request(app).get('/api/v1/customer/home').set('Host', 'acme.myplatform.test');
    expect(res.status).toBe(200);
    expect(res.body.data.featuredProducts.some((p) => p.slug === acmeProductA.slug)).toBe(true);
    expect(res.body.data.categories.some((c) => c._id === acmeCategoryId)).toBe(true);
  });

  test('a different tenant sees none of another tenant\'s featured products', async () => {
    const res = await request(app).get('/api/v1/customer/home').set('Host', 'globex.myplatform.test');
    expect(res.status).toBe(200);
    expect(res.body.data.featuredProducts.some((p) => p.slug === acmeProductA.slug)).toBe(false);
  });
});

describe('Customer product browsing', () => {
  test('lists published products with brand and price filters', async () => {
    const res = await request(app)
      .get('/api/v1/customer/products')
      .set('Host', 'acme.myplatform.test')
      .query({ brand: 'AcmeBrand', minPrice: 80, maxPrice: 120 });
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((p) => p.slug === acmeProductA.slug)).toBe(true);
    expect(res.body.data.items.some((p) => p.slug === acmeProductB.slug)).toBe(false);
  });

  test('search suggestions return name-matching products', async () => {
    const res = await request(app)
      .get('/api/v1/customer/products/search-suggestions')
      .set('Host', 'acme.myplatform.test')
      .query({ q: 'Choc' });
    expect(res.status).toBe(200);
    expect(res.body.data.some((p) => p.slug === acmeProductA.slug)).toBe(true);
  });

  test('product detail by slug includes similar products from the same category', async () => {
    const res = await request(app)
      .get(`/api/v1/customer/products/${acmeProductA.slug}`)
      .set('Host', 'acme.myplatform.test');
    expect(res.status).toBe(200);
    expect(res.body.data.product.slug).toBe(acmeProductA.slug);
    expect(res.body.data.similar.some((p) => p.slug === acmeProductB.slug)).toBe(true);
  });

  test('a tenant cannot fetch another tenant\'s product by slug', async () => {
    const res = await request(app)
      .get(`/api/v1/customer/products/${acmeProductA.slug}`)
      .set('Host', 'globex.myplatform.test');
    expect(res.status).toBe(404);
  });

  test('share endpoint tracks the event without requiring auth', async () => {
    const res = await request(app)
      .post('/api/v1/customer/products/share')
      .set('Host', 'acme.myplatform.test')
      .send({ productId: acmeProductA._id, sessionId: 'sess-share-1' });
    expect(res.status).toBe(202);
  });
});

describe('Wishlist', () => {
  test('customer can add, list, and remove a wishlist item', async () => {
    const addRes = await acmeCustomer(request(app).post('/api/v1/customer/wishlist')).send({
      productId: acmeProductA._id,
    });
    expect(addRes.status).toBe(201);

    const listRes = await acmeCustomer(request(app).get('/api/v1/customer/wishlist'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((entry) => entry.product._id === acmeProductA._id)).toBe(true);

    const removeRes = await acmeCustomer(request(app).delete(`/api/v1/customer/wishlist/${acmeProductA._id}`));
    expect(removeRes.status).toBe(200);

    const listAfter = await acmeCustomer(request(app).get('/api/v1/customer/wishlist'));
    expect(listAfter.body.data.some((entry) => entry.product._id === acmeProductA._id)).toBe(false);
  });

  test('a customer cannot wishlist a product belonging to another tenant', async () => {
    const res = await globexCustomer(request(app).post('/api/v1/customer/wishlist')).send({
      productId: acmeProductA._id,
    });
    expect(res.status).toBe(404);
  });
});

describe('Address book', () => {
  let addressId;

  test('adds the first address as default automatically', async () => {
    const res = await acmeCustomer(request(app).post('/api/v1/customer/addresses')).send({
      name: 'Acme Customer',
      phone: '9999999999',
      line1: '1 Test St',
      city: 'Chennai',
      state: 'TN',
      pincode: '600001',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.isDefault).toBe(true);
    addressId = res.body.data._id;
  });

  test('adding a second address as default unsets the first', async () => {
    const res = await acmeCustomer(request(app).post('/api/v1/customer/addresses')).send({
      name: 'Acme Customer',
      phone: '8888888888',
      line1: '2 Test Ave',
      city: 'Chennai',
      state: 'TN',
      pincode: '600002',
      isDefault: true,
    });
    expect(res.status).toBe(201);

    const listRes = await acmeCustomer(request(app).get('/api/v1/customer/addresses'));
    const first = listRes.body.data.find((a) => a._id === addressId);
    expect(first.isDefault).toBe(false);
  });

  test('deletes an address', async () => {
    const res = await acmeCustomer(request(app).delete(`/api/v1/customer/addresses/${addressId}`));
    expect(res.status).toBe(200);

    const listRes = await acmeCustomer(request(app).get('/api/v1/customer/addresses'));
    expect(listRes.body.data.some((a) => a._id === addressId)).toBe(false);
  });
});

describe('Save for later and buy again', () => {
  test('moves a cart item to saved-for-later and back', async () => {
    const addRes = await acmeCustomer(request(app).post('/api/v1/customer/cart/items')).send({
      productId: acmeProductA._id,
      sku: 'CHOC-1',
      quantity: 1,
    });
    const itemId = addRes.body.data.items[0]._id;

    const saveRes = await acmeCustomer(request(app).post(`/api/v1/customer/cart/items/${itemId}/save-for-later`));
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.data.items).toHaveLength(0);

    const savedListRes = await acmeCustomer(request(app).get('/api/v1/customer/cart/saved-items'));
    expect(savedListRes.body.data).toHaveLength(1);
    const savedItemId = savedListRes.body.data[0]._id;

    const moveBackRes = await acmeCustomer(
      request(app).post(`/api/v1/customer/cart/saved-items/${savedItemId}/move-to-cart`).send({ quantity: 1 })
    );
    expect(moveBackRes.status).toBe(200);
    expect(moveBackRes.body.data.items.some((item) => item.variantSku === 'CHOC-1')).toBe(true);

    // clean up the cart for later tests
    const cart = moveBackRes.body.data;
    const cartItemId = cart.items.find((item) => item.variantSku === 'CHOC-1')._id;
    await acmeCustomer(request(app).delete(`/api/v1/customer/cart/items/${cartItemId}`));
  });

  test('buy-again re-adds items from a past order at current price', async () => {
    await acmeCustomer(request(app).post('/api/v1/customer/cart/items')).send({
      productId: acmeProductA._id,
      sku: 'CHOC-1',
      quantity: 1,
    });
    await acmeCustomer(request(app).put('/api/v1/customer/checkout/shipping-address')).send({
      name: 'Acme Customer',
      phone: '9999999999',
      line1: '1 Test St',
      city: 'Chennai',
      state: 'TN',
      pincode: '600001',
    });
    const checkoutRes = await acmeCustomer(request(app).post('/api/v1/customer/checkout')).send({
      paymentMethod: 'cod',
    });
    const orderId = checkoutRes.body.data.order._id;

    const buyAgainRes = await acmeCustomer(request(app).post(`/api/v1/customer/orders/${orderId}/buy-again`));
    expect(buyAgainRes.status).toBe(200);
    expect(buyAgainRes.body.data.cart.items.some((item) => item.variantSku === 'CHOC-1')).toBe(true);

    // clean up the cart
    const cartItemId = buyAgainRes.body.data.cart.items.find((item) => item.variantSku === 'CHOC-1')._id;
    await acmeCustomer(request(app).delete(`/api/v1/customer/cart/items/${cartItemId}`));
  });
});

describe('Coupon discovery', () => {
  test('a public active coupon is listed for customers; a private one is not', async () => {
    await acmeAdmin(request(app).post('/api/v1/client-admin/coupons')).send({
      code: 'PUBLIC10',
      discountType: 'percentage',
      discountValue: 10,
      isPublic: true,
    });
    await acmeAdmin(request(app).post('/api/v1/client-admin/coupons')).send({
      code: 'SECRET20',
      discountType: 'percentage',
      discountValue: 20,
      isPublic: false,
    });

    const res = await request(app).get('/api/v1/customer/coupons').set('Host', 'acme.myplatform.test');
    expect(res.status).toBe(200);
    expect(res.body.data.some((c) => c.code === 'PUBLIC10')).toBe(true);
    expect(res.body.data.some((c) => c.code === 'SECRET20')).toBe(false);
  });
});

describe('Back-in-stock notifications', () => {
  test('rejects subscribing to a variant that already has stock', async () => {
    const res = await acmeCustomer(request(app).post('/api/v1/customer/back-in-stock')).send({
      productId: acmeProductA._id,
      sku: 'CHOC-1',
    });
    expect(res.status).toBe(400);
  });

  test('subscribing to an out-of-stock variant works, and restocking clears the subscription', async () => {
    const subRes = await acmeCustomer(request(app).post('/api/v1/customer/back-in-stock')).send({
      productId: acmeProductB._id,
      sku: 'CANDY-1',
    });
    expect(subRes.status).toBe(201);

    const { Product } = require('../src/models/product.model');
    const productDoc = await runAcrossAllTenants(() => Product.findById(acmeProductB._id).lean());

    await acmeAdmin(request(app).post('/api/v1/client-admin/inventory/adjust')).send({
      productId: acmeProductB._id,
      sku: 'CANDY-1',
      quantityChange: 5,
      type: 'restock',
    });

    const listRes = await acmeCustomer(request(app).get('/api/v1/customer/back-in-stock'));
    expect(listRes.body.data).toHaveLength(0);
  });
});

describe('Support enquiries', () => {
  let enquiryId;

  test('a guest can submit a contact-form enquiry', async () => {
    const res = await request(app)
      .post('/api/v1/customer/support/enquiries')
      .set('Host', 'acme.myplatform.test')
      .send({ type: 'general', name: 'Guest User', email: 'guest@test.com', message: 'Hello, question about my order' });
    expect(res.status).toBe(201);
    enquiryId = res.body.data._id;
  });

  test('client admin can list and reply to enquiries', async () => {
    const listRes = await acmeAdmin(request(app).get('/api/v1/client-admin/support/enquiries'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items.some((e) => e._id === enquiryId)).toBe(true);

    const replyRes = await acmeAdmin(
      request(app).patch(`/api/v1/client-admin/support/enquiries/${enquiryId}/reply`)
    ).send({ adminReply: 'Thanks, we will look into it.' });
    expect(replyRes.status).toBe(200);
    expect(replyRes.body.data.status).toBe('resolved');
  });

  test('a different tenant\'s admin does not see this enquiry', async () => {
    const res = await globexAdmin(request(app).get('/api/v1/client-admin/support/enquiries'));
    expect(res.body.data.items.some((e) => e._id === enquiryId)).toBe(false);
  });
});

describe('Newsletter signup', () => {
  test('subscribes an email and it appears in the admin subscriber list', async () => {
    const res = await request(app)
      .post('/api/v1/customer/newsletter/subscribe')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'newsletter-fan@test.com' });
    expect(res.status).toBe(201);

    const listRes = await acmeAdmin(request(app).get('/api/v1/client-admin/newsletter/subscribers'));
    expect(listRes.body.data.items.some((s) => s.email === 'newsletter-fan@test.com')).toBe(true);
  });
});

describe('Referral and loyalty', () => {
  test('a new signup using a valid referral code earns a bonus and links to the referrer', async () => {
    const referrerSummary = await acmeCustomer(request(app).get('/api/v1/customer/referral/summary'));
    const referralCode = referrerSummary.body.data.referralCode;
    expect(referralCode).toBeTruthy();

    await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Referred Customer', email: 'referred@acme.test', password: 'Password123!', referralCode });

    const referredLogin = await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'referred@acme.test', password: 'Password123!' });
    const referredToken = referredLogin.body.data.accessToken;

    const referredSummary = await request(app)
      .get('/api/v1/customer/referral/summary')
      .set('Host', 'acme.myplatform.test')
      .set('Authorization', `Bearer ${referredToken}`);
    expect(referredSummary.body.data.points).toBeGreaterThan(0);
    expect(referredSummary.body.data.referredByCode).toBe(referralCode);

    const referrerSummaryAfter = await acmeCustomer(request(app).get('/api/v1/customer/referral/summary'));
    expect(referrerSummaryAfter.body.data.referredCount).toBeGreaterThanOrEqual(1);
  });
});

describe('Blog', () => {
  let postId;
  let postSlug;

  test('draft posts are not visible to customers', async () => {
    const createRes = await acmeImpersonating(request(app).post('/api/v1/client-admin/blog')).send({
      title: 'Our New Arrivals',
      content: '<p>Check out our new arrivals!</p>',
      status: 'draft',
    });
    expect(createRes.status).toBe(201);
    postId = createRes.body.data._id;
    postSlug = createRes.body.data.slug;

    const listRes = await request(app).get('/api/v1/customer/blog').set('Host', 'acme.myplatform.test');
    expect(listRes.body.data.items.some((p) => p._id === postId)).toBe(false);
  });

  test('publishing makes it visible to customers by slug', async () => {
    await acmeImpersonating(request(app).patch(`/api/v1/client-admin/blog/${postId}`)).send({ status: 'published' });

    const res = await request(app).get(`/api/v1/customer/blog/${postSlug}`).set('Host', 'acme.myplatform.test');
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(postId);
  });
});

describe('Account dashboard', () => {
  test('returns profile, order summary, wishlist count and loyalty', async () => {
    const res = await acmeCustomer(request(app).get('/api/v1/customer/account/dashboard'));
    expect(res.status).toBe(200);
    expect(res.body.data.profile.email).toBe('customer@acme.test');
    expect(res.body.data.orders.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.loyalty.referralCode).toBeTruthy();
  });
});

describe('Recently viewed and recent searches', () => {
  test('tracked events are retrievable per-customer', async () => {
    const trackRes = await acmeCustomer(request(app).post('/api/v1/customer/analytics/track')).send({
      events: [
        { type: 'product_view', productId: acmeProductA._id, sessionId: 'sess-history-1' },
        { type: 'search', searchQuery: 'chocolate', sessionId: 'sess-history-1' },
      ],
    });
    expect(trackRes.status).toBe(202);

    // The ingestion queue can't run against ioredis-mock (confirmed
    // elsewhere in this suite), so call the worker's insert logic directly
    // to exercise the read-side endpoints against real data.
    const { AnalyticsEvent } = require('../src/models/analyticsEvent.model');
    const requestContext = require('../src/utils/requestContext');
    const acmeTenant = await runAcrossAllTenants(() => Tenant.findOne({ 'domain.subdomain': 'acme' }).lean());
    const customerDoc = await runAcrossAllTenants(() => Customer.findOne({ email: 'customer@acme.test' }).lean());

    await requestContext.run({ tenantId: String(acmeTenant._id), tenant: acmeTenant }, () =>
      AnalyticsEvent.insertMany([
        { type: 'product_view', productId: acmeProductA._id, customerId: customerDoc._id, sessionId: 'sess-history-1' },
        { type: 'search', searchQuery: 'chocolate', customerId: customerDoc._id, sessionId: 'sess-history-1' },
      ])
    );

    const viewedRes = await acmeCustomer(request(app).get('/api/v1/customer/analytics/recently-viewed'));
    expect(viewedRes.status).toBe(200);
    expect(viewedRes.body.data.some((p) => p._id === acmeProductA._id)).toBe(true);

    const searchesRes = await acmeCustomer(request(app).get('/api/v1/customer/analytics/recent-searches'));
    expect(searchesRes.status).toBe(200);
    expect(searchesRes.body.data.some((s) => s.query === 'chocolate')).toBe(true);
  });
});
