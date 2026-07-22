const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const cmsPageSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    content: { type: String, required: true }, // HTML
    isPublished: { type: Boolean, default: false },
    seo: {
      title: { type: String, trim: true },
      description: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

cmsPageSchema.plugin(tenantScopePlugin);

cmsPageSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

const CmsPage = mongoose.model('CmsPage', cmsPageSchema);

module.exports = { CmsPage };
