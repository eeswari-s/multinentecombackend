const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { resolveTenantFromDomain } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/customer/order.controller');
const pdfController = require('../../../controllers/customer/pdf.controller');
const {
  orderIdParamsSchema,
  cancelOrderSchema,
  listOrdersQuerySchema,
} = require('../../../validators/order.validators');

const router = Router();

router.use(resolveTenantFromDomain, authenticate, requirePersona('customer'));

router.get('/', validateRequest({ query: listOrdersQuerySchema }), controller.list);
router.get('/:id', validateRequest({ params: orderIdParamsSchema }), controller.getOne);
router.post('/:id/cancel', validateRequest({ params: orderIdParamsSchema, body: cancelOrderSchema }), controller.cancel);
router.post('/:id/invoice', validateRequest({ params: orderIdParamsSchema }), pdfController.invoice);
router.post('/:id/buy-again', validateRequest({ params: orderIdParamsSchema }), controller.buyAgain);

module.exports = router;
