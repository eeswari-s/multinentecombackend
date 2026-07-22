const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const addressService = require('../../services/customer/addressService');

const list = asyncHandler(async (req, res) => {
  const addresses = await addressService.listAddresses(req.auth.userId);
  sendSuccess(res, { data: addresses });
});

const create = asyncHandler(async (req, res) => {
  const address = await addressService.addAddress({ customerId: req.auth.userId, address: req.body });
  sendSuccess(res, { statusCode: 201, message: 'Address added', data: address });
});

const update = asyncHandler(async (req, res) => {
  const address = await addressService.updateAddress({
    customerId: req.auth.userId,
    addressId: req.params.addressId,
    updates: req.body,
  });
  sendSuccess(res, { message: 'Address updated', data: address });
});

const remove = asyncHandler(async (req, res) => {
  await addressService.deleteAddress({ customerId: req.auth.userId, addressId: req.params.addressId });
  sendSuccess(res, { message: 'Address deleted' });
});

const setDefault = asyncHandler(async (req, res) => {
  const address = await addressService.setDefaultAddress({
    customerId: req.auth.userId,
    addressId: req.params.addressId,
  });
  sendSuccess(res, { message: 'Default address updated', data: address });
});

module.exports = { list, create, update, remove, setDefault };
