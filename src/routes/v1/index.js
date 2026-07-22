const { Router } = require('express');
const superAdminRoutes = require('./superAdmin');
const clientAdminRoutes = require('./clientAdmin');
const customerRoutes = require('./customer');

const router = Router();

/**
 * Sub-routers are mounted here as each module is built (see build order in
 * the project brief, section 10). Webhook routes are mounted separately in
 * app.js BEFORE the JSON body parser since Razorpay webhook signature
 * verification requires the raw request body.
 */

router.get('/ping', (req, res) => {
  res.json({ success: true, message: 'pong', data: { version: 'v1' } });
});

router.use('/super-admin', superAdminRoutes);
router.use('/client-admin', clientAdminRoutes);
router.use('/customer', customerRoutes);

module.exports = router;
