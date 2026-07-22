const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const ORDER_STATUSES = [
  'cart',
  'pending_payment',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
];
const PAYMENT_METHODS = ['razorpay', 'cod'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantSku: { type: String, required: true },
    name: { type: String, required: true },
    attributes: { type: Map, of: String, default: {} },
    image: { type: String },
    unitPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 0, min: 0, max: 100 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String },
    invoiceNumber: { type: String, default: null },

    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },

    items: { type: [orderItemSchema], default: [] },

    pricing: {
      itemsTotal: { type: Number, default: 0 },
      shippingCharge: { type: Number, default: 0 },
      // gstAmount is always the TOTAL tax (cgst+sgst, or igst alone) — kept
      // so anything already summing "total tax" doesn't need to change.
      // The split itself is only known once shippingAddress.state is set
      // (compared against the tenant's own address.state), so it's zero
      // until then.
      gstAmount: { type: Number, default: 0 },
      cgstAmount: { type: Number, default: 0 },
      sgstAmount: { type: Number, default: 0 },
      igstAmount: { type: Number, default: 0 },
      discountAmount: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
    },

    couponCode: { type: String, default: null, uppercase: true, trim: true },

    shippingAddress: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true, default: 'IN' },
      pincode: { type: String, trim: true },
    },

    status: { type: String, enum: ORDER_STATUSES, default: 'cart', required: true },

    paymentMethod: { type: String, enum: PAYMENT_METHODS },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },

    razorpay: {
      orderId: { type: String },
      paymentId: { type: String },
      signature: { type: String },
    },

    refund: {
      razorpayRefundId: { type: String, default: null },
      amount: { type: Number, default: null },
      reason: { type: String, trim: true, default: null },
      refundedAt: { type: Date, default: null },
    },

    placedAt: { type: Date },
    confirmedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },

    // Only meaningful while status is still 'cart' — set once a recovery
    // email has been sent, so the abandoned-cart job never emails the same
    // cart twice.
    abandonedCartReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.plugin(tenantScopePlugin);

orderSchema.index({ tenantId: 1, customerId: 1, status: 1, createdAt: -1 });
// A plain `sparse` compound index only excludes a document when ALL of its
// keys are missing — since tenantId is always present, every 'cart' status
// order (which has no orderNumber yet) would still be indexed as
// {tenantId, orderNumber: null} and collide with the next one. A partial
// index with an explicit filter is what actually excludes them.
orderSchema.index(
  { tenantId: 1, orderNumber: 1 },
  { unique: true, partialFilterExpression: { orderNumber: { $type: 'string' } } }
);
orderSchema.index({ tenantId: 1, 'razorpay.orderId': 1 });
orderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = { Order, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES };
