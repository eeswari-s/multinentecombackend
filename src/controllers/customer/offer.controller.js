const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const offerApplicationService = require('../../services/customer/offerApplicationService');

const list = asyncHandler(async (req, res) => {
  const offers = await offerApplicationService.listActiveOffersForStorefront();
  sendSuccess(res, { data: offers });
});

module.exports = { list };
