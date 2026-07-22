const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const planCatalogService = require('../../services/superAdmin/planCatalogService');

function actorFrom(req) {
  return { userId: req.auth.userId, email: req.auth.email };
}

const create = asyncHandler(async (req, res) => {
  const plan = await planCatalogService.createPlan({ ...req.body, actor: actorFrom(req) });
  sendSuccess(res, { statusCode: 201, message: 'Plan created', data: plan });
});

const list = asyncHandler(async (req, res) => {
  const plans = await planCatalogService.listPlans(req.query);
  sendSuccess(res, { data: plans });
});

const getOne = asyncHandler(async (req, res) => {
  const plan = await planCatalogService.getPlanById(req.params.id);
  sendSuccess(res, { data: plan });
});

const update = asyncHandler(async (req, res) => {
  const plan = await planCatalogService.updatePlan({ id: req.params.id, updates: req.body, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Plan updated', data: plan });
});

module.exports = { create, list, getOne, update };
