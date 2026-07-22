const { Customer } = require('../../models/customer.model');
const ApiError = require('../../utils/ApiError');

async function getCustomerOrThrow(customerId) {
  const customer = await Customer.findById(customerId);
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
}

async function listAddresses(customerId) {
  const customer = await getCustomerOrThrow(customerId);
  return customer.addresses;
}

async function addAddress({ customerId, address }) {
  const customer = await getCustomerOrThrow(customerId);

  if (address.isDefault || customer.addresses.length === 0) {
    customer.addresses.forEach((a) => {
      a.isDefault = false;
    });
    address.isDefault = true;
  }

  customer.addresses.push(address);
  await customer.save();
  return customer.addresses[customer.addresses.length - 1];
}

async function updateAddress({ customerId, addressId, updates }) {
  const customer = await getCustomerOrThrow(customerId);
  const address = customer.addresses.id(addressId);
  if (!address) throw ApiError.notFound('Address not found');

  if (updates.isDefault) {
    customer.addresses.forEach((a) => {
      a.isDefault = false;
    });
  }

  Object.assign(address, updates);
  await customer.save();
  return address;
}

async function deleteAddress({ customerId, addressId }) {
  const customer = await getCustomerOrThrow(customerId);
  const address = customer.addresses.id(addressId);
  if (!address) throw ApiError.notFound('Address not found');

  const wasDefault = address.isDefault;
  address.deleteOne();

  if (wasDefault && customer.addresses.length > 0) {
    customer.addresses[0].isDefault = true;
  }

  await customer.save();
}

async function setDefaultAddress({ customerId, addressId }) {
  const customer = await getCustomerOrThrow(customerId);
  const address = customer.addresses.id(addressId);
  if (!address) throw ApiError.notFound('Address not found');

  customer.addresses.forEach((a) => {
    a.isDefault = String(a._id) === String(addressId);
  });
  await customer.save();
  return address;
}

module.exports = { listAddresses, addAddress, updateAddress, deleteAddress, setDefaultAddress };
