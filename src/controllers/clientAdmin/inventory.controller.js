const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const inventoryService = require('../../services/clientAdmin/inventoryService');

const adjust = asyncHandler(async (req, res) => {
  const resultingStock = await inventoryService.adjustStock({
    ...req.body,
    performedBy: req.auth.userId,
  });
  sendSuccess(res, { message: 'Stock adjusted', data: { resultingStock } });
});

const listMovements = asyncHandler(async (req, res) => {
  const result = await inventoryService.getMovements(req.query);
  sendSuccess(res, { data: result });
});

module.exports = { adjust, listMovements };
