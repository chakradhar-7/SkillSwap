const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET;
const User = require('../models/User');
const { isIssuedBeforePasswordChange } = require('../utils/tokens');

module.exports = async function (req, res, next) {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch (err) {
    return res.status(401).json({ msg: 'Token is not valid' });
  }

  try {
    req.user = decoded.user;

    const user = await User.findById(req.user.id).select('isBanned banReason passwordChangedAt');
    if (!user) {
      return res.status(401).json({ msg: 'User no longer exists' });
    }
    if (isIssuedBeforePasswordChange(decoded, user)) {
      return res.status(401).json({ msg: 'Your password was changed. Please log in again.' });
    }

    if (user.isBanned) {
      return res.status(403).json({
        msg: 'Your account has been banned',
        banReason: user.banReason || 'No reason provided',
      });
    }

    // Timeouts only restrict chatting; they are enforced by the chatAllowed
    // middleware and the socket handlers, not here.
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};
