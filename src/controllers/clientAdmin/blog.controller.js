const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const blogService = require('../../services/clientAdmin/blogService');

function actorFrom(req) {
  return { userId: req.auth.userId, email: req.auth.email };
}

const create = asyncHandler(async (req, res) => {
  const post = await blogService.createPost({ ...req.body, actor: actorFrom(req) });
  sendSuccess(res, { statusCode: 201, message: 'Blog post created', data: post });
});

const list = asyncHandler(async (req, res) => {
  const result = await blogService.listPosts(req.query);
  sendSuccess(res, { data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const post = await blogService.getPostById(req.params.id);
  sendSuccess(res, { data: post });
});

const update = asyncHandler(async (req, res) => {
  const post = await blogService.updatePost({ id: req.params.id, updates: req.body, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Blog post updated', data: post });
});

const remove = asyncHandler(async (req, res) => {
  await blogService.deletePost({ id: req.params.id, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Blog post deleted' });
});

module.exports = { create, list, getOne, update, remove };
