const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * AES-256-GCM encryption for per-tenant secrets (Razorpay/Brevo credentials)
 * stored at rest in MongoDB. Output format: `<ivHex>:<authTagHex>:<cipherHex>`
 * so a single string column can hold everything needed to decrypt.
 */
function encrypt(plaintext) {
  const key = Buffer.from(env.encryptionKey, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(payload) {
  const [ivHex, authTagHex, dataHex] = payload.split(':');
  const key = Buffer.from(env.encryptionKey, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Masked preview safe to return from a GET endpoint after initial save,
 * e.g. "rzp_live_****1234".
 */
function mask(plaintext) {
  if (plaintext.length <= 4) return '*'.repeat(plaintext.length);
  return `${'*'.repeat(plaintext.length - 4)}${plaintext.slice(-4)}`;
}

module.exports = { encrypt, decrypt, mask };
