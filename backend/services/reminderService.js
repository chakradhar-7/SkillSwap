const cron = require('node-cron');
const Session = require('../models/Session');
require('../models/User'); // registers the model used by populate()
const { createNotification } = require('./notificationService');
const { sendSessionReminderEmail } = require('./emailService');
const { formatInTimezone } = require('../utils/timezone');

const HOUR_MS = 60 * 60 * 1000;
const PARTICIPANT_FIELDS = 'username email emailVerified availability';

// Atomically marks a reminder as sent; returns false if another run already did
const claimReminder = async (sessionId, field, extra = {}) => {
  const result = await Session.updateOne(
    { _id: sessionId, [field]: null },
    { $set: { [field]: new Date(), ...extra } }
  );
  return result.modifiedCount === 1;
};

const notifyParticipant = async (io, session, person, other, kind) => {
  const when = formatInTimezone(session.scheduledTime, person.availability?.timeZone);
  const role = person._id.equals(session.teacher._id) ? 'teaching' : 'learning';
  const title = kind === 'soon' ? 'Session starting soon' : 'Upcoming session reminder';
  const message = role === 'teaching'
    ? `You're teaching ${session.skill} to ${other.username} at ${when}.`
    : `Your ${session.skill} session with ${other.username} is at ${when}.`;

  await createNotification(io, person._id, { type: 'reminder', title, message, link: '/dashboard' });

  // Emails go only to verified addresses
  if (person.emailVerified && person.email) {
    await sendSessionReminderEmail({ to: person.email, username: person.username, heading: title, message });
  }
};

// Sends a "within 24 hours" reminder and a "within the hour" reminder for each
// confirmed session. Each reminder is sent once; rescheduling resets them.
const runReminderCheck = async (io, now = new Date()) => {
  const sessions = await Session.find({
    status: 'confirmed',
    scheduledTime: { $gt: now, $lte: new Date(now.getTime() + 24 * HOUR_MS) },
    $or: [{ reminder24hSentAt: null }, { reminder1hSentAt: null }],
  })
    .populate('learner', PARTICIPANT_FIELDS)
    .populate('teacher', PARTICIPANT_FIELDS);

  let sent = 0;
  for (const session of sessions) {
    if (!session.learner || !session.teacher) continue;

    const startsWithinHour = session.scheduledTime.getTime() - now.getTime() <= HOUR_MS;
    let kind = null;

    if (startsWithinHour && !session.reminder1hSentAt) {
      // A late-booked session gets only the "starting soon" reminder
      if (await claimReminder(session._id, 'reminder1hSentAt', session.reminder24hSentAt ? {} : { reminder24hSentAt: now })) {
        kind = 'soon';
      }
    } else if (!startsWithinHour && !session.reminder24hSentAt) {
      if (await claimReminder(session._id, 'reminder24hSentAt')) {
        kind = 'day';
      }
    }
    if (!kind) continue;

    await notifyParticipant(io, session, session.learner, session.teacher, kind);
    await notifyParticipant(io, session, session.teacher, session.learner, kind);
    sent++;
  }

  if (sent > 0) {
    console.log(`Sent reminders for ${sent} session(s)`);
  }
  return sent;
};

const startReminderService = (io) => {
  // Every 10 minutes, so short-notice bookings still get a timely reminder
  cron.schedule('*/10 * * * *', () => {
    runReminderCheck(io).catch((err) => console.error('Error checking reminders:', err));
  });
  console.log('Reminder service started (checks every 10 minutes).');
};

module.exports = { startReminderService, runReminderCheck };
