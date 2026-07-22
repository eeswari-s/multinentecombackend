const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const categoryService = require('../../services/clientAdmin/categoryService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

const create = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory({ ...req.body, actor: actorFrom(req) });
  sendSuccess(res, { statusCode: 201, message: 'Category created', data: category });
});

const list = asyncHandler(async (req, res) => {
  const categories = await categoryService.listCategories(req.query);
  sendSuccess(res, { data: categories });
});

const getOne = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);
  sendSuccess(res, { data: category });
});

const update = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory({
    id: req.params.id,
    updates: req.body,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Category updated', data: category });
});

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('An image file is required');

  const category = await categoryService.updateCategory({
    id: req.params.id,
    updates: {},
    imageFile: req.file,
    actor: actorFrom(req),
  });
  sendSuccess(res, { message: 'Category image updated', data: category });
});

const remove = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory({ id: req.params.id, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Category deleted' });
});

module.exports = { create, list, getOne, update, uploadImage, remove };
