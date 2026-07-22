const { Router } = require('express');
const validateRequest = require('../../../middlewares/validateRequest');
const { authenticate, requirePersona } = require('../../../middlewares/auth');
const { requirePermission } = require('../../../middlewares/rbac');
const { resolveTenantFromAuth } = require('../../../middlewares/tenantResolver');
const controller = require('../../../controllers/clientAdmin/order.controller');
const pdfController = require('../../../controllers/clientAdmin/pdf.controller');
const {
  orderIdParamsSchema,
  listOrdersQuerySchema,
  updateOrderStatusSchema,
  refundOrderSchema,
} = require('../../../validators/order.validators');

const router = Router();

router.use(authenticate, requirePersona('admin'), resolveTenantFromAuth);

router.get('/', requirePermission('orders:read'), validateRequest({ query: listOrdersQuerySchema }), controller.list);
router.get(
  '/:id',
  requirePermission('orders:read'),
  validateRequest({ params: orderIdParamsSchema }),
  controller.getOne
);
router.patch(
  '/:id/status',
  requirePermission('orders:write'),
  validateRequest({ params: orderIdParamsSchema, body: updateOrderStatusSchema }),
  controller.updateStatus
);

router.post(
  '/:id/invoice',
  requirePermission('orders:read'),
  validateRequest({ params: orderIdParamsSchema }),
  pdfController.invoice
);
router.post(
  '/:id/packing-slip',
  requirePermission('orders:read'),
  validateRequest({ params: orderIdParamsSchema }),
  pdfController.packingSlip
);
router.post(
  '/:id/delivery-challan',
  requirePermission('orders:read'),
  validateRequest({ params: orderIdParamsSchema }),
  pdfController.deliveryChallan
);
router.post(
  '/:id/shipping-label',
  requirePermission('orders:read'),
  validateRequest({ params: orderIdParamsSchema }),
  pdfController.shippingLabel
);
router.post(
  '/:id/refund',
  requirePermission('orders:write'),
  validateRequest({ params: orderIdParamsSchema, body: refundOrderSchema }),
  controller.refund
);

module.exports = router;
