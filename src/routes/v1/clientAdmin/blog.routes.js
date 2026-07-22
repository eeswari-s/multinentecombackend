const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/blog.controller');
const {
  createBlogPostSchema,
  updateBlogPostSchema,
  listBlogPostsQuerySchema,
  blogPostIdParamsSchema,
} = require('../../../validators/blog.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth, requirePermission('content:manage'));

router.post('/', validateRequest({ body: createBlogPostSchema }), controller.create);
router.get('/', validateRequest({ query: listBlogPostsQuerySchema }), controller.list);
router.get('/:id', validateRequest({ params: blogPostIdParamsSchema }), controller.getOne);
router.patch('/:id', validateRequest({ params: blogPostIdParamsSchema, body: updateBlogPostSchema }), controller.update);
router.delete('/:id', validateRequest({ params: blogPostIdParamsSchema }), controller.remove);

module.exports = router;
