const { SupportEnquiry } = require('../../models/supportEnquiry.model');

async function createEnquiry({ type, customerId, name, email, phone, subject, message, productId, quantity }) {
  return SupportEnquiry.create({ type, customerId, name, email, phone, subject, message, productId, quantity });
}

module.exports = { createEnquiry };
