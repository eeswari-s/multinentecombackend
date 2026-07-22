const mongoose = require('mongoose');
const requestContext = require('../../utils/requestContext');

const QUERY_MIDDLEWARE_OPS = [
  'count',
  'countDocuments',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndRemove',
  'findOneAndReplace',
  'findOneAndUpdate',
  'distinct',
  'deleteOne',
  'deleteMany',
  'remove',
  'replaceOne',
  'update',
  'updateOne',
  'updateMany',
];

function tenantMismatchError(modelName) {
  return new Error(
    `Refusing to run unscoped query on tenant-scoped model "${modelName}": no tenant context ` +
      'is present in AsyncLocalStorage. Every tenant-scoped operation must run inside a request ' +
      'that has resolved a tenant, or explicitly inside the Super Admin cross-tenant bypass.'
  );
}

/**
 * Applied to every tenant-scoped schema (products, orders, customers, etc.).
 * Enforces isolation at the data layer instead of relying on every service
 * to remember to filter by tenantId by hand:
 *
 *   - Injects tenantId into every find/update/delete/aggregate automatically,
 *     reading it from the AsyncLocalStorage request context.
 *   - Sets tenantId on every new document before validation runs.
 *   - Fails closed: throws if no tenant context is available, rather than
 *     silently executing an unscoped (cross-tenant) query.
 *   - The ONLY way to bypass this is the `bypassTenantScope` context flag,
 *     which is set exclusively by the Super Admin cross-tenant service layer
 *     (see src/services/superAdmin/crossTenantAccess.js) — never reachable
 *     from Client Admin or Customer code paths.
 */
function tenantScopePlugin(schema, options = {}) {
  schema.add({
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      immutable: true,
    },
  });

  // Models that need a unique (or otherwise customized) index on tenantId —
  // e.g. one-config-per-tenant models — declare their own schema.index() and
  // opt out of this default to avoid a duplicate-index definition warning.
  if (options.skipDefaultIndex !== true) {
    schema.index({ tenantId: 1 });
  }

  schema.pre(QUERY_MIDDLEWARE_OPS, function applyTenantFilterToQuery() {
    if (requestContext.get('bypassTenantScope')) return;

    const tenantId = requestContext.getTenantId();
    if (!tenantId) {
      throw tenantMismatchError(this.model.modelName);
    }

    this.where({ tenantId });
  });

  schema.pre('aggregate', function applyTenantFilterToAggregate() {
    if (requestContext.get('bypassTenantScope')) return;

    const tenantId = requestContext.getTenantId();
    if (!tenantId) {
      const boundModel = this.model();
      throw tenantMismatchError(boundModel ? boundModel.modelName : 'unknown');
    }

    this.pipeline().unshift({ $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } });
  });

  // pre('validate') runs BEFORE required-field validation, so tenantId is
  // populated in time to satisfy the `required: true` check above.
  schema.pre('validate', function assignTenantIdOnNewDocument() {
    const bypass = requestContext.get('bypassTenantScope');
    const tenantId = requestContext.getTenantId();

    if (this.isNew) {
      if (!this.tenantId) {
        if (!tenantId && !bypass) {
          throw tenantMismatchError(this.constructor.modelName);
        }
        if (tenantId) this.tenantId = tenantId;
      } else if (tenantId && !bypass && String(this.tenantId) !== String(tenantId)) {
        throw new Error(
          `Attempted to create a ${this.constructor.modelName} document with tenantId ` +
            `${this.tenantId} while the active request context is scoped to tenant ${tenantId}.`
        );
      }
    }
  });

  // Unlike the other hooks, insertMany's pre-hook is invoked as fn(docs) —
  // no (next, docs) callback signature — confirmed against this Mongoose
  // version's Kareem invocation (`pre.fn.apply(context, [arr])`). Mutating
  // `docs` in place is sufficient; there is nothing to call back.
  schema.pre('insertMany', function assignTenantIdOnBulkInsert(docs) {
    const bypass = requestContext.get('bypassTenantScope');
    const tenantId = requestContext.getTenantId();

    if (!tenantId && !bypass) {
      throw tenantMismatchError(this.modelName);
    }

    for (const doc of docs) {
      if (!doc.tenantId && tenantId) {
        doc.tenantId = tenantId;
      }
    }
  });
}

module.exports = tenantScopePlugin;
