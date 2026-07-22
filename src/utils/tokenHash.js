const crypto = require('crypto');

/**
 * Refresh tokens are high-entropy JWTs, not user-chosen secrets, so a fast
 * SHA-256 fingerprint (rather than bcrypt) is sufficient for the server-side
 * lookup used to allow rotation/revocation — we're matching a fingerprint,
 * not defending against offline brute force of a low-entropy secret.
 */
function fingerprint(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeCompare(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { fingerprint, safeCompare };
