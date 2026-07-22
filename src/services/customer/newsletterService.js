const { NewsletterSubscriber } = require('../../models/newsletterSubscriber.model');

async function subscribe(email) {
  return NewsletterSubscriber.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { isActive: true } },
    { upsert: true, returnDocument: 'after' }
  );
}

async function unsubscribe(email) {
  await NewsletterSubscriber.updateOne({ email: email.toLowerCase() }, { $set: { isActive: false } });
}

module.exports = { subscribe, unsubscribe };
