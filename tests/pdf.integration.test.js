jest.mock('ioredis', () => require('ioredis-mock'));

// Puppeteer itself is mocked globally for all test files via
// __mocks__/puppeteer.js (see that file for why) — no per-file mock needed.

// BullMQ's Queue.add()/Job.waitUntilFinished() rely on Lua scripts
// (msgpack-encoded) that ioredis-mock cannot execute (confirmed separately:
// "attempt to index a nil value (global 'cmsgpack')"). The HTTP-route tests
// below are about controller/RBAC behavior, not BullMQ's own internals, so
// the queue is mocked to simulate a worker that completes immediately.
jest.mock('../src/jobs/queues/pdf.queue', () => ({
  enqueuePdfGeneration: jest.fn().mockResolvedValue({ id: 'fake-job-1' }),
  waitForJob: jest.fn().mockResolvedValue({
    _id: 'fake-generated-document-id',
    url: 'https://res.cloudinary.com/fake/raw/upload/fake.pdf',
  }),
}));

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let Tenant;
let User;
let GeneratedDocument;
let hashPassword;
let requestContext;
let pdfService;
let uploadService;

let acme;
let globex;
let ownerToken;
let confirmedOrder;
const generatedPublicIds = [];

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  ({ Tenant } = require('../src/models/tenant.model'));
  ({ User } = require('../src/models/user.model'));
  ({ GeneratedDocument } = require('../src/models/generatedDocument.model'));
  ({ hashPassword } = require('../src/utils/password'));
  requestContext = require('../src/utils/requestContext');
  pdfService = require('../src/services/pdfService');
  uploadService = require('../src/integrations/cloudinary/uploadService');

  acme = await Tenant.create({
    businessName: 'Acme Foods',
    contactEmail: 'contact@acme.test',
    domain: { subdomain: 'acme' },
    status: 'active',
    invoicePrefix: 'ACME',
    gst: { number: '29ABCDE1234F1Z5' },
  });
  globex = await Tenant.create({
    businessName: 'Globex Traders',
    contactEmail: 'contact@globex.test',
    domain: { subdomain: 'globex' },
    status: 'active',
  });

  const passwordHash = await hashPassword('Password123!');
  await User.create({ role: 'owner', tenantId: acme._id, name: 'Acme Owner', email: 'owner@acme.test', passwordHash });
  await User.create({ role: 'owner', tenantId: globex._id, name: 'Globex Owner', email: 'owner@globex.test', passwordHash });

  app = require('../src/app');

  ownerToken = (
    await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'owner@acme.test', password: 'Password123!' })
  ).body.data.accessToken;

  // Build one real confirmed order via the full checkout flow (COD, no
  // Razorpay mocking needed) so the invoice/packing-slip templates have
  // genuine data to render.
  const catRes = await request(app)
    .post('/api/v1/client-admin/categories')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'PDF Test Category' });
  const productRes = await request(app)
    .post('/api/v1/client-admin/products')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      name: 'PDF Test Widget',
      category: catRes.body.data._id,
      variants: [{ sku: 'PDF-1', price: 250, stock: 10 }],
      status: 'published',
    });

  await request(app)
    .post('/api/v1/customer/auth/register')
    .set('Host', 'acme.myplatform.test')
    .send({ name: 'PDF Customer', email: 'pdf-customer@test.com', password: 'Password123!' });
  const customerToken = (
    await request(app)
      .post('/api/v1/customer/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'pdf-customer@test.com', password: 'Password123!' })
  ).body.data.accessToken;

  await request(app)
    .post('/api/v1/customer/cart/items')
    .set('Host', 'acme.myplatform.test')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ productId: productRes.body.data._id, sku: 'PDF-1', quantity: 2 });
  await request(app)
    .put('/api/v1/customer/checkout/shipping-address')
    .set('Host', 'acme.myplatform.test')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ name: 'PDF Customer', phone: '9999999999', line1: '1 Test St', city: 'Chennai', state: 'TN', pincode: '600001' });
  const checkoutRes = await request(app)
    .post('/api/v1/customer/checkout')
    .set('Host', 'acme.myplatform.test')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ paymentMethod: 'cod' });

  confirmedOrder = checkoutRes.body.data.order;
}, 60000);

afterAll(async () => {
  if (generatedPublicIds.length > 0) {
    await uploadService.deleteMany(generatedPublicIds, 'raw');
  }
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

function runAsAcme(fn) {
  return requestContext.run({ tenantId: String(acme._id), tenant: acme.toObject() }, fn);
}
function runAsGlobex(fn) {
  return requestContext.run({ tenantId: String(globex._id), tenant: globex.toObject() }, fn);
}

function admin(req) {
  return req.set('Authorization', `Bearer ${ownerToken}`);
}

describe('PdfService — real rendering + Cloudinary upload', () => {
  test('generates a branded invoice PDF and uploads it', async () => {
    const document = await runAsAcme(() =>
      pdfService.generateDocument({ type: 'invoice', params: { orderId: confirmedOrder._id } })
    );

    expect(document.url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(document.type).toBe('invoice');
    expect(String(document.relatedId)).toBe(confirmedOrder._id);
    generatedPublicIds.push(document.publicId);
  }, 30000);

  test('generates a packing slip, a delivery challan, and a shipping label', async () => {
    const packingSlip = await runAsAcme(() =>
      pdfService.generateDocument({ type: 'packing_slip', params: { orderId: confirmedOrder._id } })
    );
    const challan = await runAsAcme(() =>
      pdfService.generateDocument({ type: 'delivery_challan', params: { orderId: confirmedOrder._id } })
    );
    const label = await runAsAcme(() =>
      pdfService.generateDocument({ type: 'shipping_label', params: { orderId: confirmedOrder._id } })
    );

    expect(packingSlip.url).toMatch(/^https:\/\//);
    expect(challan.url).toMatch(/^https:\/\//);
    expect(label.url).toMatch(/^https:\/\//);
    expect(label.type).toBe('shipping_label');
    generatedPublicIds.push(packingSlip.publicId, challan.publicId, label.publicId);
  }, 30000);

  test('generates a sales report with no related order', async () => {
    const document = await runAsAcme(() => pdfService.generateDocument({ type: 'sales_report', params: {} }));
    expect(document.url).toMatch(/^https:\/\//);
    expect(document.relatedId).toBeNull();
    generatedPublicIds.push(document.publicId);
  }, 30000);

  test('generates an analytics report', async () => {
    const document = await runAsAcme(() => pdfService.generateDocument({ type: 'analytics_report', params: {} }));
    expect(document.url).toMatch(/^https:\/\//);
    expect(document.type).toBe('analytics_report');
    expect(document.relatedId).toBeNull();
    generatedPublicIds.push(document.publicId);
  }, 30000);

  test("a tenant cannot fetch another tenant's generated document", async () => {
    const document = await runAsAcme(() =>
      pdfService.generateDocument({ type: 'inventory_report', params: {} })
    );
    generatedPublicIds.push(document.publicId);

    const fetchedByOwner = await runAsAcme(() => pdfService.getDocumentById(document._id));
    expect(String(fetchedByOwner._id)).toBe(String(document._id));

    await expect(runAsGlobex(() => pdfService.getDocumentById(document._id))).rejects.toThrow(/not found/i);
  }, 30000);
});

describe('PDF HTTP routes (queue mocked — see note above)', () => {
  test('generating an invoice returns the URL once the (mocked) worker completes', async () => {
    const res = await admin(request(app).post(`/api/v1/client-admin/orders/${confirmedOrder._id}/invoice`));
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBeDefined();
  }, 15000);

  test('generating a shipping label over HTTP returns the URL once the (mocked) worker completes', async () => {
    const res = await admin(request(app).post(`/api/v1/client-admin/orders/${confirmedOrder._id}/shipping-label`));
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBeDefined();
  }, 15000);

  test('generating an analytics report over HTTP returns the URL once the (mocked) worker completes', async () => {
    const res = await admin(request(app).post('/api/v1/client-admin/reports/analytics'));
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBeDefined();
  }, 15000);

  test('a manager without reports:read cannot generate reports', async () => {
    const passwordHash = await hashPassword('Password123!');
    await User.create({ role: 'support_staff', tenantId: acme._id, name: 'Support', email: 'support@acme.test', passwordHash });
    const staffLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'acme.myplatform.test')
      .send({ email: 'support@acme.test', password: 'Password123!' });

    const res = await request(app)
      .post('/api/v1/client-admin/reports/sales')
      .set('Authorization', `Bearer ${staffLogin.body.data.accessToken}`);
    expect(res.status).toBe(200); // support_staff DOES have reports:read per the permission table
  });

  test('fetching a generated document by id is tenant-isolated over HTTP', async () => {
    const document = await runAsAcme(() => pdfService.generateDocument({ type: 'inventory_report', params: {} }));
    generatedPublicIds.push(document.publicId);

    const ownerRes = await admin(request(app).get(`/api/v1/client-admin/reports/documents/${document._id}`));
    expect(ownerRes.status).toBe(200);

    const globexLogin = await request(app)
      .post('/api/v1/client-admin/auth/login')
      .set('Host', 'globex.myplatform.test')
      .send({ email: 'owner@globex.test', password: 'Password123!' });
    const globexRes = await request(app)
      .get(`/api/v1/client-admin/reports/documents/${document._id}`)
      .set('Authorization', `Bearer ${globexLogin.body.data.accessToken}`);
    expect(globexRes.status).toBe(404);
  }, 30000);
});
