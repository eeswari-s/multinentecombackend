const { BrevoClient } = require('@getbrevo/brevo');

function createBrevoClient(apiKey) {
  return new BrevoClient({ apiKey });
}

module.exports = { createBrevoClient };
