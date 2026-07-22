const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requireRole } = require('../../../middlewares/rbac');
const controller = require('../../../controllers/superAdmin/planCatalog.controller');
const {
  createPlanSchema,
  updatePlanSchema,
  listPlansQuerySchema,
  planIdParamsSchema,
} = require('../../../validators/planCatalog.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), requireRole('super_admin'));

router.post('/', validateRequest({ body: createPlanSchema }), controller.create);
router.get('/', validateRequest({ query: listPlansQuerySchema }), controller.list);
router.get('/:id', validateRequest({ params: planIdParamsSchema }), controller.getOne);
router.patch('/:id', validateRequest({ params: planIdParamsSchema, body: updatePlanSchema }), controller.update);

module.exports = router;
