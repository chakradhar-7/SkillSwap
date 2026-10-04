const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');

// New accounts start with this many credits (1 credit = 1 hour of learning)
const STARTING_CREDITS = 3;

const round = (value) => Math.round(value * 100) / 100;

/**
 * Changes a user's balance and records it in the ledger.
 * A negative amount only succeeds if the user has enough credits; the check and
 * the update are a single atomic operation, so concurrent requests can't overdraw.
 * Returns the new balance, or null if the balance was insufficient.
 */
const adjustCredits = async ({ io, userId, amount, type, description, sessionId = null }) => {
  const delta = round(amount);
  const query = { _id: userId };
  if (delta < 0) {
    query.credits = { $gte: -delta };
  }

  const user = await User.findOneAndUpdate(query, { $inc: { credits: delta } }, { new: true }).select('credits');
  if (!user) {
    return null;
  }

  const balance = round(user.credits);
  try {
    await CreditTransaction.create({
      user: userId,
      amount: delta,
      balanceAfter: balance,
      type,
      description,
      session: sessionId,
    });
  } catch (err) {
    console.error('Failed to record credit transaction:', err.message);
  }

  if (io) {
    io.to(`user_${userId}`).emit('creditsUpdate', { balance });
  }
  return balance;
};

const getBalance = async (userId) => {
  const user = await User.findById(userId).select('credits');
  return user ? round(user.credits || 0) : 0;
};

// Gives existing accounts (created before credits existed) their starting balance once
const grantStartingCreditsToExistingUsers = async () => {
  const users = await User.find({ credits: { $exists: false } }).select('_id');
  for (const { _id } of users) {
    const updated = await User.updateOne(
      { _id, credits: { $exists: false } },
      { $set: { credits: STARTING_CREDITS } }
    );
    if (updated.modifiedCount === 1) {
      await CreditTransaction.create({
        user: _id,
        amount: STARTING_CREDITS,
        balanceAfter: STARTING_CREDITS,
        type: 'welcome',
        description: 'Welcome credits',
      });
    }
  }
  if (users.length > 0) {
    console.log(`Granted starting credits to ${users.length} existing user(s)`);
  }
};

const recordWelcomeCredits = (userId) =>
  CreditTransaction.create({
    user: userId,
    amount: STARTING_CREDITS,
    balanceAfter: STARTING_CREDITS,
    type: 'welcome',
    description: 'Welcome credits',
  });

module.exports = {
  STARTING_CREDITS,
  adjustCredits,
  getBalance,
  grantStartingCreditsToExistingUsers,
  recordWelcomeCredits,
};
