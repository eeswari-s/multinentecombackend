const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * `persona` distinguishes an admin-side user (super_admin/owner/manager/
 * support_staff, from user.model.js) from a storefront customer
 * (customer.model.js) so a token minted for one can never be accepted on
 * routes belonging to the other, even though both are plain JWTs signed
 * with the same platform secrets.
 *
 * `jti` is a random per-token nonce. Without it, two tokens signed with
 * identical claims within the same second (iat has second resolution)
 * come out byte-for-byte identical, which would make refresh-token
 * rotation a no-op against anyone who already captured the pre-rotation
 * token.
 */
function signAccessToken({ userId, tenantId, role, persona, deviceId, email }) {
  return jwt.sign(
    { sub: String(userId), tenantId: tenantId ? String(tenantId) : null, role, persona, deviceId, email, jti: randomUUID() },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiry }
  );
}

function signRefreshToken({ userId, tenantId, role, persona, deviceId, email }) {
  return jwt.sign(
    { sub: String(userId), tenantId: tenantId ? String(tenantId) : null, role, persona, deviceId, email, jti: randomUUID() },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiry }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

const IMPERSONATION_EXPIRY = '15m';

/**
 * "Login As Client" (section 8): a distinctly-scoped, short-lived token
 * (fixed 15m regardless of the configured access-token expiry) that carries
 * an `impersonation` claim the frontend uses to render a warning banner.
 * Deliberately access-token-only — no refresh token is ever issued for an
 * impersonation session, so it cannot be silently extended.
 */
function signImpersonationToken({ userId, tenantId, role, deviceId, email, impersonatedBy }) {
  return jwt.sign(
    {
      sub: String(userId),
      tenantId: String(tenantId),
      role,
      persona: 'admin',
      deviceId,
      email,
      jti: randomUUID(),
      impersonation: {
        active: true,
        byUserId: String(impersonatedBy.userId),
        byEmail: impersonatedBy.email,
      },
    },
    env.jwt.accessSecret,
    { expiresIn: IMPERSONATION_EXPIRY }
  );
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  signImpersonationToken,
};
