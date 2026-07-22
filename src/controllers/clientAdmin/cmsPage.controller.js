const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const cmsPageService = require('../../services/clientAdmin/cmsPageService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

const create = asyncHandler(async (req, res) => {
  const page = await cmsPageService.createPage({ ...req.body, actor: actorFrom(req) });
  sendSuccess(res, { statusCode: 201, message: 'Page created', data: page });
});

const list = asyncHandler(async (req, res) => {
  const pages = await cmsPageService.listPages(req.query);
  sendSuccess(res, { data: pages });
});

const getOne = asyncHandler(async (req, res) => {
  const page = await cmsPageService.getPageById(req.params.id);
  sendSuccess(res, { data: page });
});

const update = asyncHandler(async (req, res) => {
  const page = await cmsPageService.updatePage({ id: req.params.id, updates: req.body, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Page updated', data: page });
});

const remove = asyncHandler(async (req, res) => {
  await cmsPageService.deletePage({ id: req.params.id, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Page deleted' });
});

module.exports = { create, list, getOne, update, remove };
