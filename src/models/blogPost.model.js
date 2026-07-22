const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const { Schema } = mongoose;

const BLOG_STATUSES = ['draft', 'published'];

const blogPostSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    excerpt: { type: String, trim: true, maxlength: 500 },
    content: { type: String, required: true },
    coverImage: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
    },
    authorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    tags: { type: [String], default: [] },
    status: { type: String, enum: BLOG_STATUSES, default: 'draft', required: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

blogPostSchema.plugin(tenantScopePlugin);

blogPostSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
blogPostSchema.index({ tenantId: 1, status: 1, publishedAt: -1 });

const BlogPost = mongoose.model('BlogPost', blogPostSchema);

module.exports = { BlogPost, BLOG_STATUSES };
