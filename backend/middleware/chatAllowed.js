const User = require('../models/User');
const { getChatRestriction } = require('../utils/moderation');

// Blocks chat actions for users who are currently timed out. Must run after auth.
module.exports = async function (req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    const restriction = await getChatRestriction(user);
    if (restriction) {
      return res.status(403).json(restriction);
    }
    next();
  } catch (err) {
    console.error('Chat restriction middleware error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};
