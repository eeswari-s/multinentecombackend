const { Router } = require('express');
const controller = require('../../../controllers/webhooks/razorpayPlatform.controller');

const router = Router();

// Configured once, in the SaaS owner's own Razorpay dashboard, as
// https://api.yourplatform.com/api/v1/webhooks/razorpay-platform
router.post('/', controller.handle);

module.exports = router;
