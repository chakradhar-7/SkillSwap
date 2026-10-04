const User = require('../models/User');

// Returns null if the user may chat, otherwise an error payload describing why not.
// Expired timeouts are cleared as a side effect.
const getChatRestriction = async (user) => {
  if (!user) {
    return { msg: 'User not found' };
  }

  if (user.isBanned) {
    return {
      msg: 'Your account has been banned',
      banReason: user.banReason || 'No reason provided',
    };
  }

  if (user.isTimedOut && user.timeoutUntil) {
    const now = new Date();
    if (now < user.timeoutUntil) {
      const daysLeft = Math.ceil((user.timeoutUntil - now) / (1000 * 60 * 60 * 24));
      return {
        msg: `Your account is temporarily restricted from chatting. Timeout expires in ${daysLeft} day(s).`,
        timeoutReason: user.timeoutReason || 'No reason provided',
        timeoutUntil: user.timeoutUntil,
      };
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          isTimedOut: false,
          timeoutUntil: null,
          timeoutReason: null,
          timedOutBy: null,
          timedOutAt: null,
        },
      }
    );
  }

  return null;
};

module.exports = { getChatRestriction };
