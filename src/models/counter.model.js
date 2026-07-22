const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

/**
 * Per-tenant atomic sequence generator — used for invoice numbering
 * (compliance requires sequential, gap-free numbers assigned at order
 * confirmation, never derived from array length or a timestamp) and
 * human-readable order numbers.
 */
const counterSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

counterSchema.plugin(tenantScopePlugin);

counterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

const Counter = mongoose.model('Counter', counterSchema);

module.exports = { Counter };
