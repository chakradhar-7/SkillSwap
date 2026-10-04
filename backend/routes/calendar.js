const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');
const calendarService = require('../services/calendarService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const STATE_PURPOSE = 'calendar-oauth';

// The OAuth `state` is a short-lived signed token, so a callback can only ever
// attach a calendar to the user who started the flow.
const createState = (userId, provider) =>
  jwt.sign({ uid: userId, provider, purpose: STATE_PURPOSE }, process.env.JWT_SECRET, { expiresIn: '10m' });

const verifyState = (state, provider) => {
  try {
    const payload = jwt.verify(state, process.env.JWT_SECRET);
    if (payload.purpose !== STATE_PURPOSE || payload.provider !== provider || !payload.uid) {
      return null;
    }
    return payload.uid;
  } catch (err) {
    return null;
  }
};

const redirectToProfile = (res, provider, status, msg) => {
  const params = new URLSearchParams({ calendar: provider, status });
  if (msg) params.set('msg', msg);
  res.redirect(`${FRONTEND_URL}/profile?${params.toString()}`);
};

const describeOAuthError = (error) =>
  error === 'access_denied'
    ? 'Access was denied. Please try again and grant the necessary permissions.'
    : `OAuth error: ${error}`;

// @route   GET api/calendar/google/auth
// @desc    Get Google Calendar OAuth URL
router.get('/google/auth', auth, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({
      msg: 'Google Calendar integration is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
    });
  }

  try {
    const authUrl = calendarService.google.getAuthUrl(createState(req.user.id, 'google'));
    res.json({ authUrl });
  } catch (err) {
    console.error('Error generating Google OAuth URL:', err);
    res.status(500).json({ msg: 'Failed to generate OAuth URL' });
  }
});

// @route   GET api/calendar/google/callback
// @desc    Handle Google Calendar OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('Google OAuth error:', error);
    return redirectToProfile(res, 'google', 'error', describeOAuthError(error));
  }

  const userId = verifyState(state, 'google');
  if (!code || !userId) {
    return redirectToProfile(res, 'google', 'error', 'The calendar connection link is invalid or has expired. Please try again.');
  }

  try {
    const tokens = await calendarService.google.getTokensFromCode(code);

    const update = {
      calendarProvider: 'google',
      googleCalendarToken: tokens.access_token,
    };
    // Google only returns a refresh token on first consent; keep the old one otherwise
    if (tokens.refresh_token) {
      update.googleCalendarRefreshToken = tokens.refresh_token;
    }
    await User.findByIdAndUpdate(userId, update);

    redirectToProfile(res, 'google', 'connected');
  } catch (err) {
    console.error('Google Calendar OAuth error:', err);
    redirectToProfile(res, 'google', 'error', 'Failed to connect Google Calendar');
  }
});

// @route   GET api/calendar/outlook/auth
// @desc    Get Outlook Calendar OAuth URL
router.get('/outlook/auth', auth, (req, res) => {
  const clientId = process.env.OUTLOOK_CLIENT_ID?.trim();
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      msg: 'Outlook Calendar integration is not configured. Please set OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET environment variables in the backend/.env file and restart your server.',
    });
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: calendarService.getOutlookRedirectUri(),
      response_mode: 'query',
      scope: calendarService.OUTLOOK_SCOPES,
      state: createState(req.user.id, 'outlook'),
    });
    res.json({ authUrl: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}` });
  } catch (err) {
    console.error('Error generating Outlook OAuth URL:', err);
    res.status(500).json({ msg: 'Failed to generate OAuth URL' });
  }
});

// @route   GET api/calendar/outlook/callback
// @desc    Handle Outlook Calendar OAuth callback
router.get('/outlook/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('Outlook OAuth error:', error);
    return redirectToProfile(res, 'outlook', 'error', describeOAuthError(error));
  }

  const userId = verifyState(state, 'outlook');
  if (!code || !userId) {
    return redirectToProfile(res, 'outlook', 'error', 'The calendar connection link is invalid or has expired. Please try again.');
  }

  try {
    const tokens = await calendarService.outlook.exchangeCode(code);

    await User.findByIdAndUpdate(userId, {
      calendarProvider: 'outlook',
      outlookCalendarToken: tokens.access_token,
      outlookCalendarRefreshToken: tokens.refresh_token,
    });

    redirectToProfile(res, 'outlook', 'connected');
  } catch (err) {
    console.error('Outlook Calendar OAuth error:', err.response?.data || err.message);
    redirectToProfile(res, 'outlook', 'error', 'Failed to connect Outlook Calendar');
  }
});

// @route   GET api/calendar/status
// @desc    Get user's calendar connection status
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('calendarProvider +outlookCalendarToken +googleCalendarToken');
    const connected = !!(user.calendarProvider && (
      (user.calendarProvider === 'outlook' && user.outlookCalendarToken) ||
      (user.calendarProvider === 'google' && user.googleCalendarToken)
    ));
    res.json({
      provider: user.calendarProvider,
      connected,
    });
  } catch (err) {
    console.error('Error fetching calendar status:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/calendar/disconnect
// @desc    Disconnect calendar
router.delete('/disconnect', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      calendarProvider: null,
      googleCalendarToken: null,
      googleCalendarRefreshToken: null,
      outlookCalendarToken: null,
      outlookCalendarRefreshToken: null,
    });
    res.json({ msg: 'Calendar disconnected successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
