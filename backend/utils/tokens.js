const crypto = require('crypto');

// Single-use tokens for email links. Only the SHA-256 hash is stored, so a
// database leak does not expose usable reset or verification links.
const createToken = () => crypto.randomBytes(32).toString('hex');

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

// True when a JWT was issued before the user's last password change
const isIssuedBeforePasswordChange = (decoded, user) =>
  !!(user && user.passwordChangedAt && decoded && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000));

module.exports = { createToken, hashToken, isIssuedBeforePasswordChange };
