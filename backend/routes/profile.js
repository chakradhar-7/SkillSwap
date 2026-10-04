const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Session = require('../models/Session');

// Fields of *other* users that must never be exposed. Password and calendar
// tokens are already excluded by the schema (select: false).
const PUBLIC_EXCLUDE = '-email -calendarProvider -bannedBy -bannedAt -banReason -timedOutBy -timedOutAt -timeoutReason -timeoutUntil -isTimedOut';

const MAX_SKILLS = 50;
const MAX_TEXT = 100;

const sanitizeStringList = (value) => {
  if (!Array.isArray(value)) return null;
  const cleaned = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, MAX_TEXT))
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, MAX_SKILLS);
};

const sanitizeText = (value) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : 'Not set';

// Adds hoursExchanged and peersConnected, computed from completed sessions
const withDerivedStats = async (profile) => {
  const userId = profile._id.toString();
  profile.hoursExchanged = (profile.hoursTaught || 0) + (profile.hoursLearned || 0);

  const sessions = await Session.find({
    $or: [{ learner: userId }, { teacher: userId }],
    status: 'completed',
  }).select('learner teacher');

  const peerIds = new Set();
  sessions.forEach((session) => {
    if (!session.learner || !session.teacher) return;
    peerIds.add(session.learner.toString() === userId ? session.teacher.toString() : session.learner.toString());
  });
  profile.peersConnected = peerIds.size;
  return profile;
};

// @route   GET api/profile
// @desc    Get current user's profile
router.get('/', auth, async (req, res) => {
  try {
    const profile = await User.findById(req.user.id);
    if (!profile) {
      return res.status(404).json({ msg: 'Profile not found' });
    }
    res.json(await withDerivedStats(profile));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/profile
// @desc    Update user's profile
router.put('/', auth, async (req, res) => {
  const { skillsToTeach, skillsToLearn, availability, preferredFormat } = req.body;

  const profileFields = {};
  if (skillsToTeach !== undefined) {
    const list = sanitizeStringList(skillsToTeach);
    if (!list) return res.status(400).json({ msg: 'skillsToTeach must be a list of skills' });
    profileFields.skillsToTeach = list;
  }
  if (skillsToLearn !== undefined) {
    const list = sanitizeStringList(skillsToLearn);
    if (!list) return res.status(400).json({ msg: 'skillsToLearn must be a list of skills' });
    profileFields.skillsToLearn = list;
  }
  if (availability && typeof availability === 'object') {
    profileFields.availability = {
      preferredDays: sanitizeText(availability.preferredDays),
      timeZone: sanitizeText(availability.timeZone),
      format: sanitizeText(availability.format),
    };
  }
  if (preferredFormat !== undefined) {
    const list = sanitizeStringList(preferredFormat);
    if (!list) return res.status(400).json({ msg: 'preferredFormat must be a list' });
    profileFields.preferredFormat = list;
  }

  try {
    const profile = await User.findByIdAndUpdate(
      req.user.id,
      { $set: profileFields },
      { new: true }
    );
    res.json(profile);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/profile/all
// @desc    Get public profiles of all active (non-admin, non-banned) users
router.get('/all', auth, async (req, res) => {
  try {
    const profiles = await User.find({
      role: { $ne: 'admin' },
      isBanned: { $ne: true },
    }).select(PUBLIC_EXCLUDE);
    res.json(profiles);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/profile/user/:id
// @desc    Get a specific user's public profile by ID
router.get('/user/:id', auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ msg: 'Profile not found' });
  }
  try {
    const profile = await User.findById(req.params.id).select(PUBLIC_EXCLUDE);
    if (!profile) {
      return res.status(404).json({ msg: 'Profile not found' });
    }
    res.json(await withDerivedStats(profile));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
