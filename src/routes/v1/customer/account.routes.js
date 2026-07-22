const { Router } = require('express');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/account.controller');

const router = Router();

router.use(resolveTenantFromDomain, authenticate, requirePersona('customer'));

router.get('/dashboard', controller.getDashboard);
router.get('/export', controller.exportData);
router.delete('/', controller.deleteAccount);

module.exports = router;
