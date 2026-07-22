const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const tenantScopePlugin = require('../src/models/plugins/tenantScope.plugin');
const requestContext = require('../src/utils/requestContext');
const { runAcrossAllTenants } = require('../src/services/superAdmin/crossTenantAccess');

let mongod;
let TestWidget;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const widgetSchema = new mongoose.Schema({ name: { type: String, required: true } });
  widgetSchema.plugin(tenantScopePlugin);
  TestWidget = mongoose.model('TestWidget', widgetSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await requestContext.runWithOverrides({ bypassTenantScope: true, tenantId: undefined }, () =>
    TestWidget.deleteMany({})
  );
});

function runAsTenant(tenantId, fn) {
  return requestContext.run({ requestId: 'test', tenantId }, fn);
}

describe('tenantScope.plugin', () => {
  const tenantA = new mongoose.Types.ObjectId().toString();
  const tenantB = new mongoose.Types.ObjectId().toString();

  test('auto-assigns tenantId on save from context', async () => {
    const doc = await runAsTenant(tenantA, () => TestWidget.create({ name: 'A-widget-1' }));
    expect(String(doc.tenantId)).toBe(tenantA);
  });

  test('queries executed with no tenant context throw (fail closed)', async () => {
    await expect(TestWidget.find()).rejects.toThrow(/no tenant context/i);
  });

  test('a tenant can only see its own documents', async () => {
    await runAsTenant(tenantA, () =>
      TestWidget.create([{ name: 'A-widget-1' }, { name: 'A-widget-2' }])
    );
    await runAsTenant(tenantB, () => TestWidget.create({ name: 'B-widget-1' }));

    const tenantAResults = await runAsTenant(tenantA, () => TestWidget.find());
    const tenantBResults = await runAsTenant(tenantB, () => TestWidget.find());

    expect(tenantAResults).toHaveLength(2);
    expect(tenantBResults).toHaveLength(1);
    expect(tenantAResults.every((w) => String(w.tenantId) === tenantA)).toBe(true);
    expect(tenantBResults.every((w) => String(w.tenantId) === tenantB)).toBe(true);
  });

  test('tenant A cannot fetch tenant B document by id', async () => {
    const bDoc = await runAsTenant(tenantB, () => TestWidget.create({ name: 'B-secret' }));

    const found = await runAsTenant(tenantA, () => TestWidget.findById(bDoc._id));

    expect(found).toBeNull();
  });

  test('creating a document with a mismatched explicit tenantId is rejected', async () => {
    await expect(
      runAsTenant(tenantA, () => TestWidget.create({ name: 'sneaky', tenantId: tenantB }))
    ).rejects.toThrow(/tenant/i);
  });

  test('aggregate pipelines are auto-scoped to the active tenant', async () => {
    await runAsTenant(tenantA, () =>
      TestWidget.create([{ name: 'A-widget-1' }, { name: 'A-widget-2' }])
    );
    await runAsTenant(tenantB, () => TestWidget.create({ name: 'B-widget-1' }));

    const counts = await runAsTenant(tenantA, () =>
      TestWidget.aggregate([{ $group: { _id: null, total: { $sum: 1 } } }])
    );

    expect(counts[0].total).toBe(2);
  });

  test('Super Admin cross-tenant bypass sees documents across all tenants', async () => {
    await runAsTenant(tenantA, () => TestWidget.create({ name: 'A-widget-1' }));
    await runAsTenant(tenantB, () => TestWidget.create({ name: 'B-widget-1' }));

    const all = await runAcrossAllTenants(() => TestWidget.find());

    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  test('insertMany auto-assigns tenantId to every document and scopes queries', async () => {
    await runAsTenant(tenantA, () =>
      TestWidget.insertMany([{ name: 'bulk-A-1' }, { name: 'bulk-A-2' }])
    );
    await runAsTenant(tenantB, () => TestWidget.insertMany([{ name: 'bulk-B-1' }]));

    const tenantAResults = await runAsTenant(tenantA, () => TestWidget.find({ name: /^bulk-/ }));
    expect(tenantAResults).toHaveLength(2);
    expect(tenantAResults.every((w) => String(w.tenantId) === tenantA)).toBe(true);
  });

  test('insertMany with no tenant context throws (fail closed)', async () => {
    await expect(TestWidget.insertMany([{ name: 'no-context' }])).rejects.toThrow(/no tenant context/i);
  });
});
