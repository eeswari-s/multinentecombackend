jest.mock('ioredis', () => require('ioredis-mock'));

// BullMQ can't run against ioredis-mock (confirmed elsewhere in this suite),
// so the email queue is mocked to assert on what the abandoned-cart job
// actually sends, rather than relying on delivery through a real queue.
jest.mock('../src/jobs/queues/email.queue', () => ({ enqueueEmail: jest.fn().mockResolvedValue(undefined) }));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let Order;
let hashPassword;
let runAbandonedCartCheck;
let enqueueEmail;
let runAcrossAllTenants;

let ownerToken;
let productId;
let customerId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ Order } = require('../src/models/order.model'));
  ({ hashPassword } = require('../src/utils/password'));
  ({ runAbandonedCartCheck } = require('../src/services/customer/abandonedCartService'));
  ({ enqueueEmail } = require('../src/jobs/queues/email.queue'));
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

  ownerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'Password123!' })
  ).body.data.accessToken;

  const catRes = await request(app)
    .post('/api/v1/client-admin/categories')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Abandoned Cart Category' });
  const productRes = await request(app)
    .post('/api/v1/client-admin/products')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      name: 'Abandoned Cart Widget',
      category: catRes.body.data._id,
      variants: [{ sku: 'ABANDON-1', price: 150, stock: 10 }],
      status: 'published',
    });
  productId = productRes.body.data._id;

  await request(app)
    .post('/api/v1/customer/auth/register')
    .set('Host', 'acme.myplatform.test')
    .send({ name: 'Abandon Customer', email: 'abandon-customer@test.com', password: 'Password123!' });
  const customerToken = (
    await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'abandon-customer@test.com', password: 'Password123!' })
  ).body.data.accessToken;

  await request(app)
    .post('/api/v1/customer/cart/items')
    .set('Host', 'acme.myplatform.test')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ productId, sku: 'ABANDON-1', quantity: 1 });

  const cart = await runAcrossAllTenants(() => Order.findOne({ status: 'cart' }));
  customerId = cart.customerId;

  // Backdate via the raw MongoDB driver (bypassing Mongoose's timestamps
  // plugin, which would otherwise reset updatedAt back to "now" on any
  // Mongoose-level update) so the cart looks 2 days old to the job.
  await Order.collection.updateOne(
    { _id: cart._id },
    { $set: { updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } }
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Abandoned cart recovery', () => {
  test('a cart older than the threshold gets a recovery email, and is marked so it is not re-sent', async () => {
    const result = await runAbandonedCartCheck();
    expect(result.remindersSent).toBeGreaterThanOrEqual(1);
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'abandoned_cart', to: 'abandon-customer@test.com' })
    );

    const reloaded = await runAcrossAllTenants(() => Order.findOne({ customerId, status: 'cart' }).lean());
    expect(reloaded.abandonedCartReminderSentAt).toBeTruthy();

    enqueueEmail.mockClear();
    const secondRun = await runAbandonedCartCheck();
    expect(enqueueEmail).not.toHaveBeenCalled();
    expect(secondRun.remindersSent).toBe(0);
  });
});
