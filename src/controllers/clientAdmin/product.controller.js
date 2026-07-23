const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const productService = require('../../services/clientAdmin/productService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

/**
 * SEO metadata is platform-controlled — a tenant's own login can create/edit
 * everything else about a product (including GST/tax), but `seo.*` only
 * takes effect when the request comes through Super Admin's "Login As
 * Client" impersonation (see rbac.js requirePermission's bypass). Silently
 * dropped rather than rejected so the same product form works unmodified
 * for both sessions.
 */
const stripPlatformControlledFields = (req, body) => {
  if (req.auth.impersonation?.active) return body;
  const { seo, ...rest } = body;
  return rest;
};

const create = asyncHandler(async (req, res) => {
  const product = await productService.createProduct({
    ...stripPlatformControlledFields(req, req.body),
    actor: actorFrom(req),
  });
  sendSuccess(res, { statusCode: 201, message: 'Product created', data: product });
});

const list = asyncHandler(async (req, res) => {
  const result = await productService.listProducts(req.query);
  sendSuccess(res, { data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  sendSuccess(res, { data: product });
});

const update = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct({
    id: req.params.id,
    updates: stripPlatformControlledFields(req, req.body),
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Product updated', data: product });
});

const addImages = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) throw ApiError.badRequest('At least one image file is required');

  const product = await productService.addImages({
    id: req.params.id,
    imageFiles: req.files,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Images added', data: product });
});

const removeImage = asyncHandler(async (req, res) => {
  const product = await productService.removeImage({
    id: req.params.id,
    imageId: req.params.imageId,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Image removed', data: product });
});

const setStatus = asyncHandler(async (req, res) => {
  const product = await productService.setStatus({
    id: req.params.id,
    status: req.body.status,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Product status updated', data: product });
});

const duplicate = asyncHandler(async (req, res) => {
  const product = await productService.duplicateProduct({ id: req.params.id, actor: actorFrom(req) });
  sendSuccess(res, { statusCode: 201, message: 'Product duplicated', data: product });
});

const bulkStatus = asyncHandler(async (req, res) => {
  const result = await productService.bulkUpdateStatus({ ...req.body, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Bulk status update applied', data: result });
});

const bulkCategory = asyncHandler(async (req, res) => {
  const result = await productService.bulkAssignCategory({ ...req.body, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Bulk category assignment applied', data: result });
});

const remove = asyncHandler(async (req, res) => {
  await productService.deleteProduct({ id: req.params.id, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Product deleted' });
});

module.exports = {
  create,
  list,
  getOne,
  update,
  addImages,
  removeImage,
  setStatus,
  duplicate,
  bulkStatus,
  bulkCategory,
  remove,
};
