const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const CreditTransaction = require('../models/CreditTransaction');
const { getBalance, STARTING_CREDITS } = require('../services/creditService');

// @route   GET api/credits
// @desc    Your credit balance and recent transactions
router.get('/', auth, async (req, res) => {
  try {
    const [balance, transactions] = await Promise.all([
      getBalance(req.user.id),
      CreditTransaction.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .limit(100)
        .populate('session', 'skill scheduledTime'),
    ]);
    res.json({ balance, startingCredits: STARTING_CREDITS, transactions });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
