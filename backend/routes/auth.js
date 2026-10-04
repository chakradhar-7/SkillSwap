const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');
const escapeRegex = require('../utils/escapeRegex');
const rateLimit = require('../middleware/rateLimit');
const { createToken, hashToken } = require('../utils/tokens');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { recordWelcomeCredits } = require('../services/creditService');

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;

// Slow down password guessing and mass sign-ups
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

// Limits how often email-sending endpoints can be hit
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many email requests. Please wait a few minutes and try again.',
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Older accounts may have been stored with mixed-case emails, so match case-insensitively.
const emailQuery = (email) => ({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') });
const usernameQuery = (username) => ({ username: new RegExp(`^${escapeRegex(username)}$`, 'i') });

const signToken = (userId) =>
  new Promise((resolve, reject) => {
    jwt.sign(
      { user: { id: userId } },
      process.env.JWT_SECRET,
      { expiresIn: 36000 },
      (err, token) => (err ? reject(err) : resolve(token))
    );
  });

// Stores a fresh verification token for the user and emails the link
const issueEmailVerification = async (user) => {
  const token = createToken();
  await User.updateOne(
    { _id: user._id },
    { $set: { emailVerificationTokenHash: hashToken(token), emailVerificationExpires: new Date(Date.now() + VERIFICATION_TTL_MS) } }
  );
  return sendVerificationEmail(user, token);
};

// @route   POST api/auth/register
// @desc    Register user
router.post('/register', authLimiter, async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password } = req.body;

  if (!username || username.length < 2 || username.length > 30) {
    return res.status(400).json({ msg: 'Username must be between 2 and 30 characters' });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ msg: 'Please enter a valid email address' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ msg: 'Password must be at least 6 characters' });
  }

  try {
    if (await User.findOne(emailQuery(email))) {
      return res.status(400).json({ msg: 'User already exists' });
    }
    if (await User.findOne(usernameQuery(username))) {
      return res.status(400).json({ msg: 'Username is already taken' });
    }

    const salt = await bcrypt.genSalt(10);
    const user = new User({
      username,
      email,
      password: await bcrypt.hash(password, salt),
    });
    await user.save();
    recordWelcomeCredits(user._id).catch((err) => console.error('Failed to record welcome credits:', err.message));

    // Sending the email must not hold up or fail the registration
    issueEmailVerification(user).catch((err) => console.error('Verification email failed:', err.message));

    res.json({ token: await signToken(user.id) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token
router.post('/login', authLimiter, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password } = req.body;
  if (!email || typeof password !== 'string') {
    return res.status(400).json({ msg: 'Invalid credentials' });
  }

  try {
    const user = await User.findOne(emailQuery(email)).select('+password');
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    if (user.isBanned) {
      return res.status(403).json({
        msg: `Your account has been banned. Reason: ${user.banReason || 'No reason provided'}`,
      });
    }

    res.json({ token: await signToken(user.id) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST api/auth/forgot-password
// @desc    Email a password reset link. Always answers the same way so the
//          endpoint cannot be used to discover which emails have accounts.
router.post('/forgot-password', emailLimiter, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const genericResponse = { msg: 'If an account exists for that email, we have sent a password reset link. It expires in 1 hour.' };

  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ msg: 'Please enter a valid email address' });
  }

  try {
    const user = await User.findOne(emailQuery(email));
    if (user && !user.isBanned) {
      const token = createToken();
      await User.updateOne(
        { _id: user._id },
        { $set: { passwordResetTokenHash: hashToken(token), passwordResetExpires: new Date(Date.now() + RESET_TTL_MS) } }
      );
      await sendPasswordResetEmail(user, token);
    }
    res.json(genericResponse);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST api/auth/reset-password
// @desc    Set a new password using a reset link token. Signs out other sessions.
router.post('/reset-password', authLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ msg: 'This reset link is invalid or has expired.' });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ msg: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const user = await User.findOne({
      passwordResetTokenHash: hashToken(token),
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ msg: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const salt = await bcrypt.genSalt(10);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          password: await bcrypt.hash(password, salt),
          passwordChangedAt: new Date(),
          // Opening the emailed link proves the user owns the address
          emailVerified: true,
        },
        $unset: { passwordResetTokenHash: 1, passwordResetExpires: 1 },
      }
    );

    res.json({ msg: 'Your password has been updated. You can now log in.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST api/auth/send-verification
// @desc    Re-send the email verification link to the logged-in user
router.post('/send-verification', auth, emailLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.emailVerified) {
      return res.status(400).json({ msg: 'Your email is already verified' });
    }
    const sent = await issueEmailVerification(user);
    if (!sent) {
      return res.status(502).json({ msg: 'We could not send the email right now. Please try again later.' });
    }
    res.json({ msg: `Verification email sent to ${user.email}` });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST api/auth/verify-email
// @desc    Confirm an email address using the token from the emailed link
router.post('/verify-email', authLimiter, async (req, res) => {
  const { token } = req.body;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ msg: 'This verification link is invalid or has expired.' });
  }

  try {
    const user = await User.findOneAndUpdate(
      { emailVerificationTokenHash: hashToken(token), emailVerificationExpires: { $gt: new Date() } },
      { $set: { emailVerified: true }, $unset: { emailVerificationTokenHash: 1, emailVerificationExpires: 1 } }
    );
    if (!user) {
      return res.status(400).json({ msg: 'This verification link is invalid or has expired. Please request a new one.' });
    }
    res.json({ msg: 'Your email address has been verified.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   GET api/auth
// @desc    Get logged in user
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
