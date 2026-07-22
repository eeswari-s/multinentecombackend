const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const DOCUMENT_TYPES = [
  'invoice',
  'packing_slip',
  'delivery_challan',
  'shipping_label',
  'sales_report',
  'revenue_report',
  'customer_report',
  'inventory_report',
  'analytics_report',
];

/**
 * Tracks every PDF generated for a tenant (Cloudinary URL only — the
 * binary itself never touches MongoDB). Tenant-scoped so a fetch-by-id
 * can never leak another tenant's invoice, per section 6's isolation
 * requirement.
 */
const generatedDocumentSchema = new Schema(
  {
    type: { type: String, enum: DOCUMENT_TYPES, required: true },
    relatedId: { type: Schema.Types.ObjectId, default: null }, // e.g. the Order for an invoice
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

generatedDocumentSchema.plugin(tenantScopePlugin);

generatedDocumentSchema.index({ tenantId: 1, type: 1, relatedId: 1 });

const GeneratedDocument = mongoose.model('GeneratedDocument', generatedDocumentSchema);

module.exports = { GeneratedDocument, DOCUMENT_TYPES };
