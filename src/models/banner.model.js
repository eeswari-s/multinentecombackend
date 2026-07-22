const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const bannerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    image: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
      bytes: { type: Number, default: 0 },
    },
    linkUrl: { type: String, trim: true },
    position: { type: String, enum: ['home_top', 'home_middle', 'category_page'], default: 'home_top' },
    sortOrder: { type: Number, default: 0 },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

bannerSchema.plugin(tenantScopePlugin);

bannerSchema.index({ tenantId: 1, position: 1, sortOrder: 1 });

const Banner = mongoose.model('Banner', bannerSchema);

module.exports = { Banner };
