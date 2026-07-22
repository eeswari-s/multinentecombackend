const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const requestContext = require('../../utils/requestContext');
const { enqueuePdfGeneration, waitForJob } = require('../../jobs/queues/pdf.queue');
const pdfService = require('../../services/pdfService');

const GENERATION_WAIT_MS = 20000;

async function generateAndRespond(req, res, { type, params }) {
  const tenantId = requestContext.getTenantId();
  const job = await enqueuePdfGeneration({ tenantId, type, params, generatedBy: req.auth.userId });

  try {
    const result = await waitForJob(job, GENERATION_WAIT_MS);
    sendSuccess(res, { message: 'Document generated', data: { documentId: result._id, url: result.url } });
  } catch {
    sendSuccess(res, {
      statusCode: 202,
      message: 'Document is still being generated, check back shortly',
      data: { jobId: job.id },
    });
  }
}

const invoice = asyncHandler((req, res) =>
  generateAndRespond(req, res, { type: 'invoice', params: { orderId: req.params.id } })
);
const packingSlip = asyncHandler((req, res) =>
  generateAndRespond(req, res, { type: 'packing_slip', params: { orderId: req.params.id } })
);
const deliveryChallan = asyncHandler((req, res) =>
  generateAndRespond(req, res, { type: 'delivery_challan', params: { orderId: req.params.id } })
);
const shippingLabel = asyncHandler((req, res) =>
  generateAndRespond(req, res, { type: 'shipping_label', params: { orderId: req.params.id } })
);

const salesReport = asyncHandler((req, res) => generateAndRespond(req, res, { type: 'sales_report', params: req.query }));
const revenueReport = asyncHandler((req, res) =>
  generateAndRespond(req, res, { type: 'revenue_report', params: req.query })
);
const customerReport = asyncHandler((req, res) =>
  generateAndRespond(req, res, { type: 'customer_report', params: req.query })
);
const inventoryReport = asyncHandler((req, res) => generateAndRespond(req, res, { type: 'inventory_report', params: {} }));
const analyticsReport = asyncHandler((req, res) =>
  generateAndRespond(req, res, { type: 'analytics_report', params: req.query })
);

const getDocument = asyncHandler(async (req, res) => {
  const document = await pdfService.getDocumentById(req.params.id);
  sendSuccess(res, { data: document });
});

module.exports = {
  invoice,
  packingSlip,
  deliveryChallan,
  shippingLabel,
  salesReport,
  revenueReport,
  customerReport,
  inventoryReport,
  analyticsReport,
  getDocument,
};
