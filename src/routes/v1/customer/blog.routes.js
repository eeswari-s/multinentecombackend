const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/blog.controller');
const { listBlogPostsQuerySchema, blogPostSlugParamsSchema } = require('../../../validators/blog.validators');

const router = Router();

router.use(resolveTenantFromDomain);

router.get('/', validateRequest({ query: listBlogPostsQuerySchema.omit({ status: true }) }), controller.list);
router.get('/:slug', validateRequest({ params: blogPostSlugParamsSchema }), controller.getBySlug);

module.exports = router;
