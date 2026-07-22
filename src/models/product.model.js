const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const PRODUCT_STATUSES = ['draft', 'published', 'archived'];

const variantSchema = new Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    attributes: {
      type: Map,
      of: String, // e.g. { size: 'M', color: 'Red' }
      default: {},
    },
    price: { type: Number, required: true, min: 0 },
    comparePrice: { type: Number, min: 0 }, // MRP / strike-through price
    offerPrice: { type: Number, min: 0 }, // active promotional price, if any
    stock: { type: Number, required: true, min: 0, default: 0 },
    weightGrams: { type: Number, min: 0 },
    images: {
      type: [
        {
          url: { type: String, required: true },
          publicId: { type: String, required: true },
          bytes: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    brand: { type: String, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },

    description: { type: String, trim: true },
    highlights: { type: [String], default: [] },
    faqs: {
      type: [{ question: { type: String, trim: true }, answer: { type: String, trim: true } }],
      default: [],
    },
    tags: { type: [String], default: [] },

    images: {
      type: [
        {
          url: { type: String, required: true },
          publicId: { type: String, required: true },
          altText: { type: String, trim: true },
          isPrimary: { type: Boolean, default: false },
          bytes: { type: Number, default: 0 },
        },
      ],
      default: [],
    },

    variants: {
      type: [variantSchema],
      validate: {
        validator: (variants) => Array.isArray(variants) && variants.length > 0,
        message: 'A product must have at least one variant',
      },
    },

    gst: {
      rate: { type: Number, min: 0, max: 100, default: 0 },
      hsnCode: { type: String, trim: true },
    },

    shipping: {
      weightGrams: { type: Number, min: 0 },
      dimensionsCm: {
        length: { type: Number, min: 0 },
        width: { type: Number, min: 0 },
        height: { type: Number, min: 0 },
      },
      isFreeShipping: { type: Boolean, default: false },
      shippingClass: { type: String, trim: true },
    },

    seo: {
      title: { type: String, trim: true },
      description: { type: String, trim: true },
      keywords: { type: [String], default: [] },
    },

    status: { type: String, enum: PRODUCT_STATUSES, default: 'draft', required: true },
    isFeatured: { type: Boolean, default: false },

    // Denormalized aggregates, recomputed on save — keeps listing/filter
    // queries from having to scan into the variants array every time.
    priceRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
    },
    totalStock: { type: Number, default: 0 },

    ratingsAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.plugin(tenantScopePlugin);

productSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
productSchema.index({ tenantId: 1, 'variants.sku': 1 }, { unique: true });
productSchema.index({ tenantId: 1, category: 1, status: 1 });
productSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
productSchema.index({ tenantId: 1, status: 1, isFeatured: 1 });
productSchema.index({ tenantId: 1, tags: 1 });
productSchema.index({ name: 'text', description: 'text', brand: 'text', tags: 'text' });

productSchema.pre('validate', function recomputeDenormalizedFields() {
  if (!this.variants || this.variants.length === 0) return;

  const activePrices = this.variants.map((v) => (v.offerPrice != null ? v.offerPrice : v.price));
  this.priceRange = { min: Math.min(...activePrices), max: Math.max(...activePrices) };
  this.totalStock = this.variants.reduce((sum, v) => sum + v.stock, 0);
});

const Product = mongoose.model('Product', productSchema);

module.exports = { Product, PRODUCT_STATUSES };
