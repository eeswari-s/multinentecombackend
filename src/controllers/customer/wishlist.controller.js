const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const wishlistService = require('../../services/customer/wishlistService');

const list = asyncHandler(async (req, res) => {
  const items = await wishlistService.listWishlist(req.auth.userId);
  sendSuccess(res, { data: items });
});

const add = asyncHandler(async (req, res) => {
  await wishlistService.addToWishlist({ customerId: req.auth.userId, productId: req.body.productId });
  sendSuccess(res, { statusCode: 201, message: 'Added to wishlist' });
});

const remove = asyncHandler(async (req, res) => {
  await wishlistService.removeFromWishlist({ customerId: req.auth.userId, productId: req.params.productId });
  sendSuccess(res, { message: 'Removed from wishlist' });
});

module.exports = { list, add, remove };
