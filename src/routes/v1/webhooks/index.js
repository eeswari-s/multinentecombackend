const { Router } = require('express');
const razorpayRoutes = require('./razorpay.routes');
const razorpayPlatformRoutes = require('./razorpayPlatform.routes');

const router = Router();

router.use('/razorpay', razorpayRoutes);
router.use('/razorpay-platform', razorpayPlatformRoutes);

module.exports = router;
