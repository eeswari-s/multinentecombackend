jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let Product;
let hashPassword;
let runAcrossAllTenants;

let tenantId;
let ownerToken;
let customerToken;
let categoryId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ Product } = require('../src/models/product.model'));
  ({ hashPassword } = require('../src/utils/password'));
  ({ runAcrossAllTenants } = require('../src/services/superAdmin/crossTenantAccess'));

  const tenant = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
  });
  tenantId = String(tenant._id);

  const passwordHash = await hashPassword('Password123!');
  await User.create({ role: 'owner', tenantId: tenant._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });

  app = require('../src/app');

  ownerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'Password123!' })
  ).body.data.accessToken;

  await request(app)
    .post('/api/v1/customer/auth/register')
    .set('Host', 'acme.myplatform.test')
    .send({ name: 'Test Customer', email: 'customer@test.com', password: 'Password123!' });
  customerToken = (
    await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'customer@test.com', password: 'Password123!' })
  ).body.data.accessToken;

  const catRes = await admin(request(app).post('/api/v1/client-admin/categories')).send({ name: 'Merch Test' });
  categoryId = catRes.body.data._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function admin(req) {
  return req.set('Authorization', `Bearer ${ownerToken}`);
}
function readProduct(id) {
  return runAcrossAllTenants(() => Product.findById(id).lean());
}
function customer(req) {
  return req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${customerToken}`);
}

async function createProduct({ sku, price = 100, stock = 50 }) {
  const res = await admin(request(app).post('/api/v1/client-admin/products')).send({
    name: `Product ${sku}`,
    category: categoryId,
    variants: [{ sku, price, stock }],
    status: 'published',
  });
  return res.body.data;
}

describe('Coupons', () => {
  let productA;

  beforeAll(async () => {
    productA = await createProduct({ sku: 'COUPON-A', price: 200, stock: 20 });
  });

  test('owner creates a coupon', async () => {
    const res = await admin(request(app).post('/api/v1/client-admin/coupons')).send({
      code: 'SAVE10',
      discountType: 'percentage',
      discountValue: 10,
      minOrderValue: 100,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('SAVE10');
  });

  test('customer applies a valid coupon to cart and sees discount', async () => {
    await customer(request(app).post('/api/v1/customer/cart/items')).send({
      productId: productA._id,
      sku: 'COUPON-A',
      quantity: 2,
    });

    const res = await customer(request(app).post('/api/v1/customer/cart/coupon')).send({ code: 'SAVE10' });
    expect(res.status).toBe(200);
    expect(res.body.data.pricing.discountAmount).toBe(40); // 10% of 400
    expect(res.body.data.pricing.grandTotal).toBeLessThan(res.body.data.pricing.itemsTotal + res.body.data.pricing.gstAmount + res.body.data.pricing.shippingCharge);
  });

  test('an unknown coupon code is rejected', async () => {
    const res = await customer(request(app).post('/api/v1/customer/cart/coupon')).send({ code: 'DOESNOTEXIST' });
    expect(res.status).toBe(404);
  });

  test('removing the coupon clears the discount', async () => {
    const res = await customer(request(app).delete('/api/v1/customer/cart/coupon'));
    expect(res.status).toBe(200);
    expect(res.body.data.pricing.discountAmount).toBe(0);
  });

  test('a coupon below minOrderValue is rejected', async () => {
    await customer(request(app).delete(`/api/v1/customer/cart/items/${(await customer(request(app).get('/api/v1/customer/cart'))).body.data.items[0]._id}`));
    const productB = await createProduct({ sku: 'COUPON-B', price: 50, stock: 10 });
    await customer(request(app).post('/api/v1/customer/cart/items')).send({
      productId: productB._id,
      sku: 'COUPON-B',
      quantity: 1,
    });

    const res = await customer(request(app).post('/api/v1/customer/cart/coupon')).send({ code: 'SAVE10' });
    expect(res.status).toBe(400);
  });
});

describe('Offers', () => {
  test('a simple discount offer sets variant.offerPrice, and clears it on deactivation', async () => {
    const product = await createProduct({ sku: 'FLASH-1', price: 500, stock: 10 });

    const createRes = await admin(request(app).post('/api/v1/client-admin/offers')).send({
      name: 'Flash Sale',
      type: 'flash_sale',
      applicableProducts: [product._id],
      discountType: 'percentage',
      discountValue: 20,
      startAt: new Date(Date.now() - 60000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(createRes.status).toBe(201);

    const productAfter = await readProduct(product._id);
    expect(productAfter.variants[0].offerPrice).toBe(400); // 500 - 20%

    const deactivateRes = await admin(
      request(app).patch(`/api/v1/client-admin/offers/${createRes.body.data._id}/deactivate`)
    );
    expect(deactivateRes.status).toBe(200);

    const productAfterDeactivate = await readProduct(product._id);
    expect(productAfterDeactivate.variants[0].offerPrice).toBeUndefined();
  });

  test('a combo offer applies a cart-level discount when all combo products are present', async () => {
    const productX = await createProduct({ sku: 'COMBO-X', price: 100, stock: 10 });
    const productY = await createProduct({ sku: 'COMBO-Y', price: 150, stock: 10 });

    await admin(request(app).post('/api/v1/client-admin/offers')).send({
      name: 'Combo Deal',
      type: 'combo',
      comboProductIds: [productX._id, productY._id],
      discountType: 'fixed',
      discountValue: 50,
      startAt: new Date(Date.now() - 60000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // Fresh customer/cart for isolation from earlier coupon tests.
    await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Combo Customer', email: 'combo-customer@test.com', password: 'Password123!' });
    const comboToken = (
      await request(app)
        .post('/api/v1/customer/auth/login')
        .set('Host', 'acme.myplatform.test')
        .send({ email: 'combo-customer@test.com', password: 'Password123!' })
    ).body.data.accessToken;
    const comboReq = (req) => req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${comboToken}`);

    await comboReq(request(app).post('/api/v1/customer/cart/items')).send({
      productId: productX._id,
      sku: 'COMBO-X',
      quantity: 1,
    });
    const res = await comboReq(request(app).post('/api/v1/customer/cart/items')).send({
      productId: productY._id,
      sku: 'COMBO-Y',
      quantity: 1,
    });

    expect(res.body.data.pricing.discountAmount).toBe(50);
  });
});

describe('Banners', () => {
  test('creating a banner requires an image, then it appears in the active list', async () => {
    const noImageRes = await admin(request(app).post('/api/v1/client-admin/banners')).send({ title: 'No Image' });
    expect(noImageRes.status).toBe(400);

    const imageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    const createRes = await admin(request(app).post('/api/v1/client-admin/banners'))
      .field('title', 'Homepage Banner')
      .field('position', 'home_top')
      .attach('image', imageBuffer, 'banner.png');
    expect(createRes.status).toBe(201);

    const activeRes = await request(app).get('/api/v1/customer/banners').set('Host', 'acme.myplatform.test');
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data.some((b) => b.title === 'Homepage Banner')).toBe(true);
  }, 30000);
});

describe('CMS Pages', () => {
  test('creates a page, and only published pages are publicly visible', async () => {
    const draftRes = await admin(request(app).post('/api/v1/client-admin/cms-pages')).send({
      title: 'Draft Page',
      content: '<p>draft</p>',
      isPublished: false,
    });
    expect(draftRes.status).toBe(201);

    const publicDraftRes = await request(app)
      .get(`/api/v1/customer/cms-pages/${draftRes.body.data.slug}`)
      .set('Host', 'acme.myplatform.test');
    expect(publicDraftRes.status).toBe(404);

    const publishedRes = await admin(request(app).post('/api/v1/client-admin/cms-pages')).send({
      title: 'About Us',
      content: '<p>We sell things.</p>',
      isPublished: true,
    });

    const publicRes = await request(app)
      .get(`/api/v1/customer/cms-pages/${publishedRes.body.data.slug}`)
      .set('Host', 'acme.myplatform.test');
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.title).toBe('About Us');
  });
});

describe('Shipping settings', () => {
  test('updating shipping settings changes cart pricing', async () => {
    const product = await createProduct({ sku: 'SHIP-1', price: 100, stock: 10 });

    await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Ship Customer', email: 'ship-customer@test.com', password: 'Password123!' });
    const shipToken = (
      await request(app)
        .post('/api/v1/customer/auth/login')
        .set('Host', 'acme.myplatform.test')
        .send({ email: 'ship-customer@test.com', password: 'Password123!' })
    ).body.data.accessToken;
    const shipReq = (req) => req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${shipToken}`);

    const addRes = await shipReq(request(app).post('/api/v1/customer/cart/items')).send({
      productId: product._id,
      sku: 'SHIP-1',
      quantity: 1,
    });
    expect(addRes.body.data.pricing.shippingCharge).toBe(49); // default flat rate, below default free threshold

    await admin(request(app).put('/api/v1/client-admin/store-settings/shipping')).send({
      flatRate: 20,
      freeShippingThreshold: 50,
    });

    const updatedRes = await shipReq(request(app).get('/api/v1/customer/cart'));
    expect(updatedRes.body.data.pricing.shippingCharge).toBe(0); // 100 >= new threshold of 50
  });
});

describe('Reviews', () => {
  test('a customer can only review a product from a delivered order they actually bought', async () => {
    const product = await createProduct({ sku: 'REVIEW-1', price: 100, stock: 10 });

    await request(app)
      .post('/api/v1/customer/auth/register')
      .set('Host', 'acme.myplatform.test')
      .send({ name: 'Review Customer', email: 'review-customer@test.com', password: 'Password123!' });
    const reviewToken = (
      await request(app)
        .post('/api/v1/customer/auth/login')
        .set('Host', 'acme.myplatform.test')
        .send({ email: 'review-customer@test.com', password: 'Password123!' })
    ).body.data.accessToken;
    const reviewReq = (req) => req.set('Host', 'acme.myplatform.test').set('Authorization', `Bearer ${reviewToken}`);

    await reviewReq(request(app).post('/api/v1/customer/cart/items')).send({
      productId: product._id,
      sku: 'REVIEW-1',
      quantity: 1,
    });
    await reviewReq(request(app).put('/api/v1/customer/checkout/shipping-address')).send({
      name: 'Review Customer',
      phone: '9999999999',
      line1: '1 Test St',
      city: 'Chennai',
      state: 'TN',
      pincode: '600001',
    });
    const checkoutRes = await reviewReq(request(app).post('/api/v1/customer/checkout')).send({ paymentMethod: 'cod' });
    const orderId = checkoutRes.body.data.order._id;

    const tooEarlyRes = await reviewReq(request(app).post('/api/v1/customer/reviews')).send({
      productId: product._id,
      orderId,
      rating: 5,
      comment: 'Great!',
    });
    expect(tooEarlyRes.status).toBe(400); // order is only 'confirmed', not yet 'delivered'

    await admin(request(app).patch(`/api/v1/client-admin/orders/${orderId}/status`)).send({ status: 'processing' });
    await admin(request(app).patch(`/api/v1/client-admin/orders/${orderId}/status`)).send({ status: 'shipped' });
    await admin(request(app).patch(`/api/v1/client-admin/orders/${orderId}/status`)).send({ status: 'delivered' });

    const reviewRes = await reviewReq(request(app).post('/api/v1/customer/reviews')).send({
      productId: product._id,
      orderId,
      rating: 5,
      comment: 'Great product!',
    });
    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.data.status).toBe('pending');

    // Not yet visible publicly until moderated.
    const beforeModeration = await request(app)
      .get(`/api/v1/customer/reviews/product/${product._id}`)
      .set('Host', 'acme.myplatform.test');
    expect(beforeModeration.body.data).toHaveLength(0);

    const moderateRes = await admin(request(app).patch(`/api/v1/client-admin/reviews/${reviewRes.body.data._id}`)).send({
      status: 'approved',
    });
    expect(moderateRes.status).toBe(200);

    const afterModeration = await request(app)
      .get(`/api/v1/customer/reviews/product/${product._id}`)
      .set('Host', 'acme.myplatform.test');
    expect(afterModeration.body.data).toHaveLength(1);

    const productAfter = await readProduct(product._id);
    expect(productAfter.ratingsAverage).toBe(5);
    expect(productAfter.ratingsCount).toBe(1);
  }, 30000);
});
