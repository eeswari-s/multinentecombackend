const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const offerService = require('../../services/clientAdmin/offerService');

const actorFrom = (req) => ({ userId: req.auth.userId, email: req.auth.email });

const create = asyncHandler(async (req, res) => {
  const offer = await offerService.createOffer({ ...req.body, actor: actorFrom(req) });
  sendSuccess(res, { statusCode: 201, message: 'Offer created', data: offer });
});

const list = asyncHandler(async (req, res) => {
  const offers = await offerService.listOffers(req.query);
  sendSuccess(res, { data: offers });
});

const deactivate = asyncHandler(async (req, res) => {
  const offer = await offerService.deactivateOffer({ id: req.params.id, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Offer deactivated', data: offer });
});

const remove = asyncHandler(async (req, res) => {
  await offerService.deleteOffer({ id: req.params.id, actor: actorFrom(req) });
  sendSuccess(res, { message: 'Offer deleted' });
});

module.exports = { create, list, deactivate, remove };
