const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const addressSchema = new Schema(
  {
    label: { type: String, trim: true, default: 'Home' },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, trim: true, default: 'IN' },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },

    isVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'blocked', 'deleted'], default: 'active' },

    lastLoginAt: { type: Date },

    addresses: { type: [addressSchema], default: [] },

    loyalty: {
      points: { type: Number, default: 0, min: 0 },
      referralCode: { type: String, trim: true, uppercase: true },
      referredByCode: { type: String, trim: true, uppercase: true, default: null },
    },
  },
  { timestamps: true }
);

customerSchema.plugin(tenantScopePlugin);

customerSchema.index({ tenantId: 1, email: 1 }, { unique: true });

customerSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

const Customer = mongoose.model('Customer', customerSchema);

module.exports = { Customer };
