const { AsyncLocalStorage } = require('async_hooks');

/**
 * Single AsyncLocalStorage instance shared across the whole request lifecycle.
 * Populated in stages by middleware:
 *   - requestId middleware (app.js) sets { requestId } before anything else runs
 *   - tenantResolver middleware (section 3) adds { tenantId, tenant }
 *   - auth middleware adds { userId, role }
 *
 * Every downstream service/repository/util/logger call reads from here instead
 * of receiving tenantId/requestId threaded through every function signature.
 */
const als = new AsyncLocalStorage();

/**
 * `als.run(store, fn)` restores the previous store as soon as the
 * SYNCHRONOUS invocation of `fn` returns. Mongoose Query objects are
 * thenables that only start executing (and only fire their tenant-scoping
 * pre-hooks) once something calls `.then()`/`.exec()` on them. A callback
 * like `() => Model.find()` returns that un-executed Query without ever
 * awaiting it, so `.then()` gets called later by the caller — by which
 * point the context has already been torn down and the query silently
 * runs unscoped. Wrapping every callback in an async function that awaits
 * it internally forces `.then()` to fire while the context is still active,
 * regardless of how the call site wrote its callback.
 */
async function invokeWithinContext(callback) {
  return await callback();
}

function run(initialStore, callback) {
  return als.run(new Map(Object.entries(initialStore)), invokeWithinContext, callback);
}

/**
 * Runs `callback` in a child context that inherits everything from the
 * currently active store, with `overrides` layered on top. Used by the
 * narrow Super Admin cross-tenant service layer to flag a bypass without
 * losing requestId/logging context.
 */
function runWithOverrides(overrides, callback) {
  const parentStore = als.getStore() || new Map();
  const childStore = new Map(parentStore);
  for (const [key, value] of Object.entries(overrides)) {
    childStore.set(key, value);
  }
  return als.run(childStore, invokeWithinContext, callback);
}

function getStore() {
  return als.getStore();
}

function get(key) {
  const store = als.getStore();
  return store ? store.get(key) : undefined;
}

function set(key, value) {
  const store = als.getStore();
  if (!store) {
    throw new Error(
      `requestContext.set('${key}') called outside of an active AsyncLocalStorage context`
    );
  }
  store.set(key, value);
}

function getRequestId() {
  return get('requestId');
}

function getTenantId() {
  return get('tenantId');
}

function getTenant() {
  return get('tenant');
}

function getUserId() {
  return get('userId');
}

function getRole() {
  return get('role');
}

module.exports = {
  als,
  run,
  runWithOverrides,
  getStore,
  get,
  set,
  getRequestId,
  getTenantId,
  getTenant,
  getUserId,
  getRole,
};
