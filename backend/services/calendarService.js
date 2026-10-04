const { google } = require('googleapis');
const axios = require('axios');
const User = require('../models/User');

const DEFAULT_GOOGLE_REDIRECT = 'http://localhost:5000/api/calendar/google/callback';
const DEFAULT_OUTLOOK_REDIRECT = 'http://localhost:5000/api/calendar/outlook/callback';
const OUTLOOK_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const OUTLOOK_SCOPES = 'https://graph.microsoft.com/Calendars.ReadWrite offline_access';

const getGoogleRedirectUri = () => process.env.GOOGLE_REDIRECT_URI?.trim() || DEFAULT_GOOGLE_REDIRECT;
const getOutlookRedirectUri = () => process.env.OUTLOOK_REDIRECT_URI?.trim() || DEFAULT_OUTLOOK_REDIRECT;

// Event details shared by Google and Outlook
const buildEventDetails = async (session) => {
  const [learner, teacher] = await Promise.all([
    User.findById(session.learner).select('username email'),
    User.findById(session.teacher).select('username email'),
  ]);
  if (!learner || !teacher) {
    throw new Error('Session participants not found');
  }
  const startTime = new Date(session.scheduledTime);
  const endTime = new Date(startTime.getTime() + (session.durationHours || 1) * 60 * 60 * 1000);
  return { learner, teacher, startTime, endTime };
};

/**
 * Google Calendar Service
 */
class GoogleCalendarService {
  constructor() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.warn('Google Calendar credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }
  }

  // A fresh client per call: OAuth clients hold credentials, so sharing one
  // between concurrent requests could act on the wrong user's calendar.
  createOAuthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getGoogleRedirectUri()
    );
  }

  getAuthUrl(state) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google Calendar credentials not configured');
    }
    return this.createOAuthClient().generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      prompt: 'consent',
      state,
    });
  }

  async getTokensFromCode(code) {
    const { tokens } = await this.createOAuthClient().getToken(code);
    return tokens;
  }

  async getClient(userId) {
    const user = await User.findById(userId).select('+googleCalendarToken +googleCalendarRefreshToken');
    if (!user || !user.googleCalendarToken) {
      throw new Error('Google Calendar not connected');
    }

    const client = this.createOAuthClient();
    client.setCredentials({
      access_token: user.googleCalendarToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // The library refreshes expired access tokens automatically; persist new ones.
    client.on('tokens', (tokens) => {
      const update = {};
      if (tokens.access_token) update.googleCalendarToken = tokens.access_token;
      if (tokens.refresh_token) update.googleCalendarRefreshToken = tokens.refresh_token;
      if (Object.keys(update).length > 0) {
        User.findByIdAndUpdate(userId, update).catch((err) =>
          console.error('Failed to persist refreshed Google token:', err.message)
        );
      }
    });

    return google.calendar({ version: 'v3', auth: client });
  }

  async buildEvent(session) {
    const { learner, teacher, startTime, endTime } = await buildEventDetails(session);
    return {
      summary: `SkillSwap: ${session.skill}`,
      description: `Teaching session: ${session.skill}\nTeacher: ${teacher.username}\nLearner: ${learner.username}${session.meetingLink ? `\nMeeting Link: ${session.meetingLink}` : ''}`,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      attendees: [{ email: learner.email }, { email: teacher.email }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    };
  }

  async createEvent(userId, session) {
    const calendar = await this.getClient(userId);
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: await this.buildEvent(session),
      sendUpdates: 'all',
    });

    return {
      eventId: response.data.id,
      htmlLink: response.data.htmlLink,
    };
  }

  async updateEvent(userId, session) {
    if (!session.calendarEventId) {
      return this.createEvent(userId, session);
    }

    const calendar = await this.getClient(userId);
    try {
      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: session.calendarEventId,
        resource: await this.buildEvent(session),
        sendUpdates: 'all',
      });
      return {
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
      };
    } catch (err) {
      if (err.code === 404 || err.code === 410) {
        return this.createEvent(userId, session);
      }
      throw err;
    }
  }

  async deleteEvent(userId, calendarEventId) {
    if (!calendarEventId) return;

    const calendar = await this.getClient(userId);
    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: calendarEventId,
        sendUpdates: 'all',
      });
    } catch (err) {
      if (err.code !== 404 && err.code !== 410) {
        throw err;
      }
      // Event already deleted, ignore
    }
  }
}

/**
 * Outlook Calendar Service
 */
class OutlookCalendarService {
  async exchangeCode(code) {
    const response = await axios.post(
      OUTLOOK_TOKEN_URL,
      new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID?.trim() || '',
        client_secret: process.env.OUTLOOK_CLIENT_SECRET?.trim() || '',
        code,
        redirect_uri: getOutlookRedirectUri(),
        grant_type: 'authorization_code',
        scope: OUTLOOK_SCOPES,
      })
    );
    return response.data;
  }

  async getAccessToken(userId) {
    const user = await User.findById(userId).select('+outlookCalendarToken');
    if (!user || !user.outlookCalendarToken) {
      throw new Error('Outlook Calendar not connected');
    }
    // Expired tokens are refreshed on 401 by the callers below
    return user.outlookCalendarToken;
  }

  async refreshToken(userId) {
    const user = await User.findById(userId).select('+outlookCalendarRefreshToken');
    if (!user || !user.outlookCalendarRefreshToken) {
      throw new Error('Outlook refresh token not available');
    }

    try {
      const response = await axios.post(
        OUTLOOK_TOKEN_URL,
        new URLSearchParams({
          client_id: process.env.OUTLOOK_CLIENT_ID?.trim() || '',
          client_secret: process.env.OUTLOOK_CLIENT_SECRET?.trim() || '',
          refresh_token: user.outlookCalendarRefreshToken,
          grant_type: 'refresh_token',
          scope: OUTLOOK_SCOPES,
        })
      );

      await User.findByIdAndUpdate(userId, {
        outlookCalendarToken: response.data.access_token,
        outlookCalendarRefreshToken: response.data.refresh_token || user.outlookCalendarRefreshToken,
      });

      return response.data.access_token;
    } catch (err) {
      throw new Error('Failed to refresh Outlook token');
    }
  }

  // Runs a Graph request, refreshing the access token once on 401
  async withToken(userId, request) {
    const accessToken = await this.getAccessToken(userId);
    try {
      return await request(accessToken);
    } catch (err) {
      if (err.response?.status === 401) {
        return request(await this.refreshToken(userId));
      }
      throw err;
    }
  }

  async buildEvent(session) {
    const { learner, teacher, startTime, endTime } = await buildEventDetails(session);
    return {
      subject: `SkillSwap: ${session.skill}`,
      body: {
        contentType: 'Text',
        content: `Teaching session: ${session.skill}\nTeacher: ${teacher.username}\nLearner: ${learner.username}${session.meetingLink ? `\nMeeting Link: ${session.meetingLink}` : ''}`,
      },
      start: { dateTime: startTime.toISOString().replace('Z', ''), timeZone: 'UTC' },
      end: { dateTime: endTime.toISOString().replace('Z', ''), timeZone: 'UTC' },
      attendees: [
        { emailAddress: { address: learner.email }, type: 'required' },
        { emailAddress: { address: teacher.email }, type: 'required' },
      ],
      reminderMinutesBeforeStart: 15,
      isReminderOn: true,
    };
  }

  async createEvent(userId, session) {
    const event = await this.buildEvent(session);
    const response = await this.withToken(userId, (token) =>
      axios.post('https://graph.microsoft.com/v1.0/me/calendar/events', event, {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    return {
      eventId: response.data.id,
      webLink: response.data.webLink,
    };
  }

  async updateEvent(userId, session) {
    if (!session.calendarEventId) {
      return this.createEvent(userId, session);
    }

    const event = await this.buildEvent(session);
    try {
      const response = await this.withToken(userId, (token) =>
        axios.patch(`https://graph.microsoft.com/v1.0/me/calendar/events/${encodeURIComponent(session.calendarEventId)}`, event, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      return {
        eventId: response.data.id,
        webLink: response.data.webLink,
      };
    } catch (err) {
      if (err.response?.status === 404) {
        return this.createEvent(userId, session);
      }
      throw err;
    }
  }

  async deleteEvent(userId, calendarEventId) {
    if (!calendarEventId) return;

    try {
      await this.withToken(userId, (token) =>
        axios.delete(`https://graph.microsoft.com/v1.0/me/calendar/events/${encodeURIComponent(calendarEventId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
    } catch (err) {
      if (err.response?.status !== 404) {
        throw err;
      }
      // Event already deleted, ignore
    }
  }
}

/**
 * Main Calendar Service - Factory pattern
 */
class CalendarService {
  constructor() {
    this.google = new GoogleCalendarService();
    this.outlook = new OutlookCalendarService();
  }

  getProvider(provider) {
    if (provider === 'google') return this.google;
    if (provider === 'outlook') return this.outlook;
    throw new Error('Invalid calendar provider');
  }

  async createEvent(userId, session, provider) {
    return this.getProvider(provider).createEvent(userId, session);
  }

  async updateEvent(userId, session, provider) {
    return this.getProvider(provider).updateEvent(userId, session);
  }

  async deleteEvent(userId, calendarEventId, provider) {
    return this.getProvider(provider).deleteEvent(userId, calendarEventId);
  }
}

module.exports = new CalendarService();
module.exports.GoogleCalendarService = GoogleCalendarService;
module.exports.OutlookCalendarService = OutlookCalendarService;
module.exports.getOutlookRedirectUri = getOutlookRedirectUri;
module.exports.OUTLOOK_SCOPES = OUTLOOK_SCOPES;
