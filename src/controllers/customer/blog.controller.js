const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const blogService = require('../../services/customer/blogService');

const list = asyncHandler(async (req, res) => {
  const result = await blogService.listPublishedPosts(req.query);
  sendSuccess(res, { data: result });
});

const getBySlug = asyncHandler(async (req, res) => {
  const post = await blogService.getPublishedPostBySlug(req.params.slug);
  sendSuccess(res, { data: post });
});

module.exports = { list, getBySlug };
