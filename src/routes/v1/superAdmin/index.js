const { Router } = require('express');
const authRoutes = require('./auth.routes');
const clientRoutes = require('./clients.routes');
const staffRoutes = require('./staff.routes');
const billingRoutes = require('./billing.routes');
const platformHealthRoutes = require('./platformHealth.routes');
const platformSettingsRoutes = require('./platformSettings.routes');
const platformNotificationRoutes = require('./platformNotification.routes');
const plansRoutes = require('./plans.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/clients', clientRoutes);
router.use('/staff', staffRoutes);
router.use('/billing', billingRoutes);
router.use('/platform-health', platformHealthRoutes);
router.use('/platform-settings', platformSettingsRoutes);
router.use('/notifications', platformNotificationRoutes);
router.use('/plans', plansRoutes);

module.exports = router;
