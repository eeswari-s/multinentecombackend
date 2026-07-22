const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const cartService = require('../../services/customer/cartService');

const getCart = asyncHandler(async (req, res) => {
  const cart = await cartService.getCart(req.auth.userId);
  sendSuccess(res, { data: cart });
});

const addItem = asyncHandler(async (req, res) => {
  const cart = await cartService.addItem({ customerId: req.auth.userId, ...req.body });
  sendSuccess(res, { message: 'Item added to cart', data: cart });
});

const updateItem = asyncHandler(async (req, res) => {
  const cart = await cartService.updateItemQuantity({
    customerId: req.auth.userId,
    itemId: req.params.itemId,
    quantity: req.body.quantity,
  });
  sendSuccess(res, { message: 'Cart updated', data: cart });
});

const removeItem = asyncHandler(async (req, res) => {
  const cart = await cartService.removeItem({ customerId: req.auth.userId, itemId: req.params.itemId });
  sendSuccess(res, { message: 'Item removed', data: cart });
});

const applyCoupon = asyncHandler(async (req, res) => {
  const cart = await cartService.applyCoupon({ customerId: req.auth.userId, code: req.body.code });
  sendSuccess(res, { message: 'Coupon applied', data: cart });
});

const removeCoupon = asyncHandler(async (req, res) => {
  const cart = await cartService.removeCoupon({ customerId: req.auth.userId });
  sendSuccess(res, { message: 'Coupon removed', data: cart });
});

const saveForLater = asyncHandler(async (req, res) => {
  const cart = await cartService.saveForLater({ customerId: req.auth.userId, itemId: req.params.itemId });
  sendSuccess(res, { message: 'Item saved for later', data: cart });
});

const listSaved = asyncHandler(async (req, res) => {
  const items = await cartService.listSavedItems(req.auth.userId);
  sendSuccess(res, { data: items });
});

const moveToCart = asyncHandler(async (req, res) => {
  const cart = await cartService.moveToCart({
    customerId: req.auth.userId,
    savedItemId: req.params.savedItemId,
    quantity: req.body.quantity,
  });
  sendSuccess(res, { message: 'Item moved to cart', data: cart });
});

const removeSaved = asyncHandler(async (req, res) => {
  await cartService.removeSavedItem({ customerId: req.auth.userId, savedItemId: req.params.savedItemId });
  sendSuccess(res, { message: 'Saved item removed' });
});

const buyAgain = asyncHandler(async (req, res) => {
  const result = await cartService.buyAgain({ customerId: req.auth.userId, orderId: req.params.orderId });
  sendSuccess(res, { message: 'Items added to cart', data: result });
});

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  applyCoupon,
  removeCoupon,
  saveForLater,
  listSaved,
  moveToCart,
  removeSaved,
  buyAgain,
};
