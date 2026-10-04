const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const escapeRegex = require('../utils/escapeRegex');

// @route   GET api/skills/search
// @desc    Search for users who can teach a skill
router.get('/search', auth, async (req, res) => {
  const skill = typeof req.query.skill === 'string' ? req.query.skill.trim().slice(0, 100) : '';
  if (!skill) {
    return res.json([]);
  }

  try {
    const teachers = await User.find({
      skillsToTeach: { $regex: escapeRegex(skill), $options: 'i' },
      _id: { $ne: req.user.id },
      role: { $ne: 'admin' },
      isBanned: { $ne: true },
    }).select('username skillsToTeach skillsToLearn availability preferredFormat averageRating totalRatings hoursTaught');

    res.json(teachers);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
