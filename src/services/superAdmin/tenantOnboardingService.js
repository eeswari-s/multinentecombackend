const { Category } = require('../../models/category.model');
const { CmsPage } = require('../../models/cmsPage.model');
const requestContext = require('../../utils/requestContext');
const slugify = require('../../utils/slugify');

const DEFAULT_CMS_PAGES = [
  { title: 'About Us', content: '<p>Tell your customers about your business here.</p>' },
  { title: 'Contact Us', content: '<p>Add your contact details here.</p>' },
  { title: 'Shipping Policy', content: '<p>Describe your shipping timelines and charges here.</p>' },
  { title: 'Refund Policy', content: '<p>Describe your refund and return terms here.</p>' },
  { title: 'Privacy Policy', content: '<p>Describe how customer data is collected and used here.</p>' },
  { title: 'Terms & Conditions', content: '<p>Describe the terms of using your store here.</p>' },
];

/**
 * Runs once, right after Super Admin creates a new tenant — gives every
 * store a non-blank starting point rather than an empty catalog and no
 * legal/informational pages. Kept deliberately generic (no assumptions
 * about what the business sells): a single starter category so product
 * creation isn't blocked on "no category exists yet", and the handful of
 * policy pages nearly every storefront needs, left unpublished (draft) so
 * the tenant reviews/edits the placeholder text before it ever goes live.
 * Shipping defaults need no separate step here — they're already applied
 * by the Tenant schema's own field defaults at creation time.
 */
async function provisionDefaults(tenant) {
  await requestContext.run({ tenantId: String(tenant._id), tenant: tenant.toObject ? tenant.toObject() : tenant }, async () => {
    await Category.create({ name: 'General', slug: 'general', description: 'Default starter category' });

    for (const page of DEFAULT_CMS_PAGES) {
      await CmsPage.create({ title: page.title, slug: slugify(page.title), content: page.content, isPublished: false });
    }
  });
}

module.exports = { provisionDefaults };
