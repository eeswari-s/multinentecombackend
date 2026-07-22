const { Router } = require('express');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requireRole } = require('../../../middlewares/rbac');
const controller = require('../../../controllers/superAdmin/platformHealth.controller');

const router = Router();

router.use(authenticate, requirePersona('admin'), requireRole('super_admin'));

router.get('/', controller.getHealth);

module.exports = router;
