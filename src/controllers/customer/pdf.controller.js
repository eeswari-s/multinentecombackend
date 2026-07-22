const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const requestContext = require('../../utils/requestContext');
const { enqueuePdfGeneration, waitForJob } = require('../../jobs/queues/pdf.queue');
const orderService = require('../../services/orderService');

const GENERATION_WAIT_MS = 20000;

const invoice = asyncHandler(async (req, res) => {
  // Ensures the order actually belongs to this customer before generating
  // anything — tenant isolation alone isn't enough: a customer must never
  // be able to fetch another customer's invoice just by guessing an id.
  await orderService.getCustomerOrder(req.auth.userId, req.params.id);

  const tenantId = requestContext.getTenantId();
  const job = await enqueuePdfGeneration({
    tenantId,
    type: 'invoice',
    params: { orderId: req.params.id },
    generatedBy: null,
  });

  try {
    const result = await waitForJob(job, GENERATION_WAIT_MS);
    sendSuccess(res, { message: 'Invoice generated', data: { documentId: result._id, url: result.url } });
  } catch {
    sendSuccess(res, {
      statusCode: 202,
      message: 'Invoice is still being generated, check back shortly',
      data: { jobId: job.id },
    });
  }
});

module.exports = { invoice };
