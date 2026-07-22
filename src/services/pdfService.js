const { Order } = require('../models/order.model');
const { GeneratedDocument } = require('../models/generatedDocument.model');
const { renderHtmlToPdf } = require('./pdfRenderer');
const uploadService = require('../integrations/cloudinary/uploadService');
const reportDataService = require('./clientAdmin/reportDataService');
const { invoiceTemplate } = require('../templates/pdf/invoice');
const { packingSlipTemplate } = require('../templates/pdf/packingSlip');
const { deliveryChallanTemplate } = require('../templates/pdf/deliveryChallan');
const { shippingLabelTemplate } = require('../templates/pdf/shippingLabel');
const { salesReportTemplate } = require('../templates/pdf/salesReport');
const { revenueReportTemplate } = require('../templates/pdf/revenueReport');
const { customerReportTemplate } = require('../templates/pdf/customerReport');
const { inventoryReportTemplate } = require('../templates/pdf/inventoryReport');
const { analyticsReportTemplate } = require('../templates/pdf/analyticsReport');
const requestContext = require('../utils/requestContext');
const ApiError = require('../utils/ApiError');

async function loadOrder(orderId) {
  const order = await Order.findOne({ _id: orderId, status: { $ne: 'cart' } }).lean();
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

const GENERATORS = {
  invoice: async ({ orderId }) => {
    const order = await loadOrder(orderId);
    if (!order.invoiceNumber) throw ApiError.badRequest('This order has not been confirmed yet');
    return { html: invoiceTemplate({ tenant: requestContext.getTenant(), order }), relatedId: order._id };
  },
  packing_slip: async ({ orderId }) => {
    const order = await loadOrder(orderId);
    return { html: packingSlipTemplate({ tenant: requestContext.getTenant(), order }), relatedId: order._id };
  },
  delivery_challan: async ({ orderId }) => {
    const order = await loadOrder(orderId);
    return { html: deliveryChallanTemplate({ tenant: requestContext.getTenant(), order }), relatedId: order._id };
  },
  shipping_label: async ({ orderId }) => {
    const order = await loadOrder(orderId);
    return { html: shippingLabelTemplate({ tenant: requestContext.getTenant(), order }), relatedId: order._id };
  },
  sales_report: async ({ startDate, endDate }) => {
    const data = await reportDataService.getSalesReportData({ startDate, endDate });
    return { html: salesReportTemplate({ tenant: requestContext.getTenant(), data, startDate, endDate }), relatedId: null };
  },
  revenue_report: async ({ startDate, endDate }) => {
    const data = await reportDataService.getRevenueReportData({ startDate, endDate });
    return {
      html: revenueReportTemplate({ tenant: requestContext.getTenant(), data, startDate, endDate }),
      relatedId: null,
    };
  },
  customer_report: async ({ startDate, endDate }) => {
    const data = await reportDataService.getCustomerReportData({ startDate, endDate });
    return {
      html: customerReportTemplate({ tenant: requestContext.getTenant(), data, startDate, endDate }),
      relatedId: null,
    };
  },
  inventory_report: async () => {
    const data = await reportDataService.getInventoryReportData();
    return { html: inventoryReportTemplate({ tenant: requestContext.getTenant(), data }), relatedId: null };
  },
  analytics_report: async ({ startDate, endDate }) => {
    const data = await reportDataService.getAnalyticsReportData({ startDate, endDate });
    return {
      html: analyticsReportTemplate({ tenant: requestContext.getTenant(), data, startDate, endDate }),
      relatedId: null,
    };
  },
};

/**
 * Renders `type` (one of GENERATED_DOCUMENT types), uploads the resulting
 * PDF to Cloudinary (raw resource, tenant-scoped folder), and records it
 * in GeneratedDocument. Called only from the PDF queue's worker — never
 * inline in a request handler (section 6).
 */
async function generateDocument({ type, params = {}, generatedBy = null }) {
  const generator = GENERATORS[type];
  if (!generator) throw new Error(`Unknown PDF document type "${type}"`);

  const { html, relatedId } = await generator(params);
  const pdfBuffer = await renderHtmlToPdf(html);

  const tenantId = requestContext.getTenantId();
  const uploaded = await uploadService.uploadBuffer(pdfBuffer, `tenants/${tenantId}/documents/${type}`, 'raw');

  const document = await GeneratedDocument.create({
    type,
    relatedId,
    url: uploaded.url,
    publicId: uploaded.publicId,
    generatedBy,
  });

  return document;
}

async function getDocumentById(documentId) {
  const document = await GeneratedDocument.findById(documentId).lean();
  if (!document) throw ApiError.notFound('Document not found');
  return document;
}

module.exports = { generateDocument, getDocumentById };
