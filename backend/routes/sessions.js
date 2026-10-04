const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Session = require('../models/Session');
const User = require('../models/User');
const Review = require('../models/Review');
const Conversation = require('../models/Conversation');
const { createZoomMeeting, createInstantZoomMeeting } = require('../services/zoomService');
const calendarService = require('../services/calendarService');
const { validateScheduleInput, generateSessionDates } = require('../utils/schedule');
const escapeRegex = require('../utils/escapeRegex');
const { computeAvailableSlots, parseTimeSlots } = require('../utils/availability');
const { formatInTimezone } = require('../utils/timezone');
const { notify } = require('../services/notificationService');
const { adjustCredits, getBalance } = require('../services/creditService');

const formatCredits = (amount) => `${Math.round(amount * 100) / 100} credit${amount === 1 ? '' : 's'}`;

const MAX_SKILL_LENGTH = 100;

const parseDuration = (value) => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 0.5 && duration <= 8 ? duration : null;
};

const parseFutureDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return !isNaN(date.getTime()) && date > new Date() ? date : null;
};

const cleanSkill = (skill) =>
  typeof skill === 'string' ? skill.trim().slice(0, MAX_SKILL_LENGTH) : '';

const isSessionMember = (session, userId) =>
  [session.teacher, session.learner].some((member) => member && (member._id || member).toString() === userId);

// Creates a calendar event on the teacher's calendar if they connected one.
// Calendar failures never fail the request.
const attachCalendarEvent = async (session, teacher) => {
  if (!teacher || !teacher.calendarProvider) return;
  try {
    const result = await calendarService.createEvent(teacher._id, session, teacher.calendarProvider);
    session.calendarEventId = result.eventId;
    session.calendarProvider = teacher.calendarProvider;
    session.calendarLink = result.htmlLink || result.webLink;
  } catch (err) {
    console.error('Error creating calendar event:', err.message);
  }
};

const removeCalendarEvent = async (session) => {
  if (!session.calendarEventId || !session.calendarProvider) return;
  try {
    const teacher = await User.findById(session.teacher).select('calendarProvider');
    if (teacher && teacher.calendarProvider === session.calendarProvider) {
      await calendarService.deleteEvent(teacher._id, session.calendarEventId, session.calendarProvider);
    }
  } catch (err) {
    console.error('Error deleting calendar event:', err.message);
  }
};

// Helper function for Streak Logic
const updateStreak = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let lastCompletion = null;
    if (user.lastSessionCompleted) {
      lastCompletion = new Date(user.lastSessionCompleted);
      lastCompletion.setHours(0, 0, 0, 0);
    }

    let newStreak;
    if (lastCompletion && lastCompletion.getTime() === today.getTime()) {
      return; // Already updated today
    } else if (lastCompletion && lastCompletion.getTime() === yesterday.getTime()) {
      newStreak = (user.currentStreak || 0) + 1;
    } else {
      newStreak = 1;
    }

    await User.findByIdAndUpdate(
      userId,
      { $set: { currentStreak: newStreak, lastSessionCompleted: new Date() } },
      { runValidators: false }
    );
  } catch (err) {
    console.error(`Error updating streak for user ${userId}:`, err.message);
  }
};

// @route   POST api/sessions/request
// @desc    Request a new session (optionally proposing a time)
router.post('/request', auth, async (req, res) => {
  const { teacherId, proposedTime, durationHours } = req.body;
  const skill = cleanSkill(req.body.skill);
  const paymentType = req.body.paymentType === 'credits' ? 'credits' : 'barter';

  if (!mongoose.isValidObjectId(teacherId)) {
    return res.status(400).json({ msg: 'Invalid teacher' });
  }
  if (teacherId === req.user.id) {
    return res.status(400).json({ msg: 'You cannot request a session with yourself' });
  }
  if (!skill) {
    return res.status(400).json({ msg: 'Please select a skill to learn' });
  }

  let proposed = null;
  if (proposedTime) {
    proposed = parseFutureDate(proposedTime);
    if (!proposed) {
      return res.status(400).json({ msg: 'Proposed time must be a valid date in the future' });
    }
  }
  let proposedDuration = null;
  if (durationHours !== undefined && durationHours !== null && durationHours !== '') {
    proposedDuration = parseDuration(durationHours);
    if (!proposedDuration) {
      return res.status(400).json({ msg: 'Duration must be between 0.5 and 8 hours' });
    }
  }

  try {
    const teacher = await User.findById(teacherId).select('username role isBanned skillsToTeach');
    if (!teacher || teacher.isBanned || teacher.role === 'admin') {
      return res.status(404).json({ msg: 'Teacher not found' });
    }

    // Use the teacher's own spelling of the skill
    const taughtSkill = (teacher.skillsToTeach || []).find((s) => s.toLowerCase() === skill.toLowerCase());
    if (!taughtSkill) {
      return res.status(400).json({ msg: `${teacher.username} does not teach ${skill}` });
    }

    const duplicate = await Session.findOne({
      learner: req.user.id,
      teacher: teacherId,
      skill: new RegExp(`^${escapeRegex(taughtSkill)}$`, 'i'),
      status: 'pending',
    });
    if (duplicate) {
      return res.status(400).json({ msg: 'You already have a pending request for this skill with this teacher' });
    }

    // Credits are reserved when the teacher confirms; check now that at least one session is affordable
    if (paymentType === 'credits') {
      const needed = proposedDuration || 1;
      const balance = await getBalance(req.user.id);
      if (balance < needed) {
        return res.status(400).json({
          msg: `You need at least ${formatCredits(needed)} for this request but have ${formatCredits(balance)}. Teach a session to earn more, or use a barter.`,
        });
      }
    }

    const session = await new Session({
      learner: req.user.id,
      teacher: teacherId,
      skill: taughtSkill,
      status: 'pending',
      proposedTime: proposed,
      proposedDurationHours: proposedDuration,
      paymentType,
    }).save();

    const [learner, teacherProfile] = await Promise.all([
      User.findById(req.user.id).select('username'),
      User.findById(teacherId).select('availability'),
    ]);
    const proposedText = proposed
      ? ` and proposed ${formatInTimezone(proposed, teacherProfile?.availability?.timeZone)}`
      : '';
    notify(req, teacherId, {
      type: 'session_request',
      title: 'New session request',
      message: `${learner.username} wants to learn ${taughtSkill}${proposedText}${paymentType === 'credits' ? ', paying with time credits' : ''}.`,
      link: '/requests',
    });

    res.json(session);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/sessions/instant
// @desc    Create an instant session with a Zoom meeting (requires an accepted chat connection)
router.post('/instant', auth, async (req, res) => {
  const { teacherId } = req.body;
  const skill = cleanSkill(req.body.skill) || 'General Session';

  if (!mongoose.isValidObjectId(teacherId)) {
    return res.status(400).json({ msg: 'Invalid teacher' });
  }
  if (teacherId === req.user.id) {
    return res.status(400).json({ msg: 'You cannot start a session with yourself' });
  }

  try {
    const teacher = await User.findById(teacherId).select('username isBanned');
    if (!teacher || teacher.isBanned) {
      return res.status(404).json({ msg: 'Teacher not found' });
    }

    const connection = await Conversation.findOne({
      participants: { $all: [req.user.id, teacherId] },
      status: 'accepted',
    });
    if (!connection) {
      return res.status(403).json({ msg: 'You can only start instant sessions with users you are connected with' });
    }

    const learner = await User.findById(req.user.id).select('username');
    const topic = `SkillSwap: ${skill} (${teacher.username} & ${learner.username})`;

    let zoomMeeting;
    try {
      zoomMeeting = await createInstantZoomMeeting(topic);
    } catch (zoomErr) {
      console.error('Zoom API failed:', zoomErr.message);
      return res.status(502).json({ msg: 'Could not create Zoom meeting' });
    }

    const session = await new Session({
      learner: req.user.id,
      teacher: teacherId,
      skill,
      status: 'confirmed',
      scheduledTime: new Date(),
      durationHours: 1,
      meetingLink: zoomMeeting.join_url,
      startUrl: zoomMeeting.start_url,
    }).save();

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${teacherId}`).emit('meetingCreated', {
        sessionId: session._id,
        meetingLink: zoomMeeting.join_url,
        skill,
        teacher: learner.username, // shown as "<name> has started the session"
        notifyUserId: teacherId,
      });
    }
    notify(req, teacherId, {
      type: 'meeting',
      title: 'Instant session started',
      message: `${learner.username} started an instant ${skill} session. The join link is in your chat.`,
      link: '/messages',
    });

    // The host start URL is only returned to the teacher (via the dashboard)
    const result = session.toObject();
    delete result.startUrl;
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/sessions/availability/:teacherId?duration=1&days=14
// @desc    Free time slots for booking with a teacher, based on their profile
//          availability minus sessions already booked by the teacher or by you
router.get('/availability/:teacherId', auth, async (req, res) => {
  const { teacherId } = req.params;
  if (!mongoose.isValidObjectId(teacherId)) {
    return res.status(404).json({ msg: 'Teacher not found' });
  }
  const duration = parseDuration(req.query.duration ?? 1);
  if (!duration) {
    return res.status(400).json({ msg: 'Duration must be between 0.5 and 8 hours' });
  }
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 28);

  try {
    const teacher = await User.findById(teacherId).select('username availability role isBanned');
    if (!teacher || teacher.isBanned || teacher.role === 'admin') {
      return res.status(404).json({ msg: 'Teacher not found' });
    }

    const now = new Date();
    const people = [teacher._id, new mongoose.Types.ObjectId(req.user.id)];
    const booked = await Session.find({
      status: 'confirmed',
      $or: [{ teacher: { $in: people } }, { learner: { $in: people } }],
      scheduledTime: { $gte: new Date(now.getTime() - 8 * 60 * 60 * 1000), $lte: new Date(now.getTime() + (days + 1) * 24 * 60 * 60 * 1000) },
    }).select('scheduledTime durationHours');

    const busy = booked.map((s) => ({
      start: s.scheduledTime.getTime(),
      end: s.scheduledTime.getTime() + (s.durationHours || 1) * 60 * 60 * 1000,
    }));

    const availability = teacher.availability || {};
    res.json({
      teacher: { _id: teacher._id, username: teacher.username },
      timeZone: availability.timeZone || 'Not set',
      preferredDays: availability.preferredDays || 'Not set',
      hasAvailability: parseTimeSlots(availability.format).length > 0,
      durationHours: duration,
      slots: computeAvailableSlots({ availability, busy, durationMinutes: duration * 60, now, days }),
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   GET api/sessions
// @desc    Get all sessions for the logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const sessions = await Session.find({
      $or: [{ learner: req.user.id }, { teacher: req.user.id }],
    })
      .populate('learner', 'username')
      .populate('teacher', 'username')
      .populate('barterSessionId', 'skill status scheduledTime')
      .sort({ requestedDate: -1 })
      .lean();

    // Learners never receive the Zoom host link
    sessions.forEach((session) => {
      if (!session.teacher || session.teacher._id.toString() !== req.user.id) {
        delete session.startUrl;
      }
    });

    // Drop sessions whose other participant was deleted
    res.json(sessions.filter((s) => s.learner && s.teacher));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/sessions/respond/:id
// @desc    Respond to a session request (Accept/Decline).
//          Barter system: the teacher must choose a skill to learn from the learner,
//          unless this request is itself the reverse half of a barter.
router.put('/respond/:id', auth, async (req, res) => {
  const {
    response,
    scheduledTime,
    durationHours,
    numberOfWeeks,
    daysOfWeek,
    timeOfDay,
    utcOffsetMinutes,
  } = req.body;
  const barterSkill = cleanSkill(req.body.barterSkill);

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ msg: 'Session not found' });
  }

  // Set while credits are reserved but the sessions are not saved yet, so a
  // failure part-way through gives the learner their credits back
  let pendingRefund = null;

  try {
    const session = await Session.findById(req.params.id)
      .populate('learner', 'username skillsToTeach availability')
      .populate('teacher', 'username');

    if (!session || !session.learner || !session.teacher) {
      return res.status(404).json({ msg: 'Session not found' });
    }
    if (session.teacher._id.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'User not authorized' });
    }
    if (session.status !== 'pending') {
      return res.status(400).json({ msg: 'This request has already been answered' });
    }

    if (response === 'declined' || response === 'cancelled') {
      await removeCalendarEvent(session);
      session.status = 'cancelled';
      session.scheduledTime = null;
      session.meetingLink = null;
      session.startUrl = null;
      session.calendarEventId = null;
      session.calendarProvider = null;
      session.calendarLink = null;
      await session.save();
      notify(req, session.learner._id, {
        type: 'session_update',
        title: 'Session request declined',
        message: `${session.teacher.username} declined your request to learn ${session.skill}.`,
        link: '/requests',
      });
      return res.json(session);
    }

    if (response !== 'confirmed') {
      return res.status(400).json({ msg: 'Invalid response' });
    }

    const isCreditSession = session.paymentType === 'credits';
    const isReverseBarterRequest = !!session.barterSessionId;
    if (!isReverseBarterRequest && !isCreditSession) {
      if (!barterSkill) {
        return res.status(400).json({
          msg: 'This is a barter system. Please select a skill you want to learn from the learner.',
        });
      }
      const learnerSkills = (session.learner.skillsToTeach || []).map((s) => s.toLowerCase());
      if (!learnerSkills.includes(barterSkill.toLowerCase())) {
        return res.status(400).json({ msg: `${session.learner.username} does not teach ${barterSkill}` });
      }
    }

    // Work out the schedule BEFORE creating anything, so a bad schedule
    // never leaves an orphaned barter request behind.
    let sessionDates;
    let duration;
    const isRecurring = numberOfWeeks !== undefined || daysOfWeek !== undefined || timeOfDay !== undefined;
    if (isRecurring) {
      const validationError = validateScheduleInput({ numberOfWeeks, daysOfWeek, timeOfDay, durationHours, utcOffsetMinutes });
      if (validationError) {
        return res.status(400).json({ msg: validationError });
      }
      // If the learner proposed a future time, start the schedule from that day
      // (in the teacher's timezone) instead of from today
      const offsetMs = (Number(utcOffsetMinutes) || 0) * 60 * 1000;
      let scheduleStart = new Date();
      if (session.proposedTime && session.proposedTime > scheduleStart) {
        const proposedLocal = new Date(session.proposedTime.getTime() + offsetMs);
        const proposedDayStart = Date.UTC(proposedLocal.getUTCFullYear(), proposedLocal.getUTCMonth(), proposedLocal.getUTCDate()) - offsetMs;
        scheduleStart = new Date(Math.max(scheduleStart.getTime(), proposedDayStart));
      }
      sessionDates = generateSessionDates({
        numberOfWeeks,
        daysOfWeek,
        timeOfDay,
        utcOffsetMinutes: Number(utcOffsetMinutes) || 0,
        now: scheduleStart,
      });
      if (sessionDates.length === 0) {
        return res.status(400).json({ msg: 'No valid session dates generated' });
      }
      duration = Number(durationHours);
    } else {
      const single = parseFutureDate(scheduledTime);
      duration = parseDuration(durationHours);
      if (!single || !duration) {
        return res.status(400).json({ msg: 'A future schedule time and a duration (0.5-8 hours) are required' });
      }
      sessionDates = [single];
    }

    // Credit sessions: reserve the learner's credits for every scheduled session up front
    const creditsPerSession = isCreditSession ? duration : 0;
    const totalCredits = creditsPerSession * sessionDates.length;
    if (isCreditSession) {
      const balance = await adjustCredits({
        io: req.app.get('io'),
        userId: session.learner._id,
        amount: -totalCredits,
        type: 'payment',
        description: `Reserved for ${sessionDates.length} ${session.skill} session${sessionDates.length !== 1 ? 's' : ''} with ${session.teacher.username}`,
        sessionId: session._id,
      });
      if (balance === null) {
        const available = await getBalance(session.learner._id);
        return res.status(400).json({
          msg: `${session.learner.username} has ${formatCredits(available)}, but this schedule costs ${formatCredits(totalCredits)} (${sessionDates.length} session${sessionDates.length !== 1 ? 's' : ''} x ${duration}h). Schedule fewer or shorter sessions.`,
        });
      }
      pendingRefund = { userId: session.learner._id, amount: totalCredits, sessionId: session._id, skill: session.skill };
    }

    let barterSession = null;
    if (!isReverseBarterRequest && !isCreditSession) {
      barterSession = await new Session({
        learner: session.teacher._id, // original teacher becomes the learner
        teacher: session.learner._id, // original learner becomes the teacher
        skill: barterSkill,
        status: 'pending',
        barterSessionId: session._id,
      }).save();
      session.barterSessionId = barterSession._id;
    }

    const teacher = await User.findById(session.teacher._id).select('calendarProvider');

    session.status = 'confirmed';
    session.scheduledTime = sessionDates[0];
    session.durationHours = duration;
    session.creditsHeld = creditsPerSession;
    // The Zoom meeting is created when the teacher starts the session
    session.meetingLink = null;
    session.startUrl = null;
    await attachCalendarEvent(session, teacher);
    await session.save();

    const createdSessions = [session];
    for (let i = 1; i < sessionDates.length; i++) {
      const extra = new Session({
        learner: session.learner._id,
        teacher: session.teacher._id,
        skill: session.skill,
        status: 'confirmed',
        scheduledTime: sessionDates[i],
        durationHours: duration,
        requestedDate: session.requestedDate,
        paymentType: session.paymentType,
        creditsHeld: creditsPerSession,
      });
      await attachCalendarEvent(extra, teacher);
      await extra.save();
      createdSessions.push(extra);
    }

    pendingRefund = null; // everything is saved
    const count = createdSessions.length;
    notify(req, session.learner._id, {
      type: 'session_update',
      title: 'Session request accepted',
      message: `${session.teacher.username} scheduled ${count} ${session.skill} session${count !== 1 ? 's' : ''}, starting ${formatInTimezone(sessionDates[0], session.learner.availability?.timeZone)}.${isCreditSession ? ` ${formatCredits(totalCredits)} reserved.` : ''}`,
      link: '/dashboard',
    });
    if (barterSession) {
      notify(req, session.learner._id, {
        type: 'session_request',
        title: 'Barter request',
        message: `In return, ${session.teacher.username} would like to learn ${barterSkill} from you. Schedule it from your requests.`,
        link: '/requests',
      });
    }

    res.json({
      sessions: createdSessions,
      message: `Created ${count} session${count !== 1 ? 's' : ''}`,
      creditsReserved: totalCredits,
      barterSession: barterSession
        ? {
            _id: barterSession._id,
            skill: barterSession.skill,
            message: `A request has been sent to ${session.learner.username} to teach you ${barterSkill}. Please wait for them to schedule it.`,
          }
        : null,
    });
  } catch (err) {
    console.error(err.message);
    if (pendingRefund) {
      await adjustCredits({
        io: req.app.get('io'),
        userId: pendingRefund.userId,
        amount: pendingRefund.amount,
        type: 'refund',
        description: `Refund: ${pendingRefund.skill} sessions could not be scheduled`,
        sessionId: pendingRefund.sessionId,
      }).catch((refundErr) => console.error('Credit refund failed:', refundErr.message));
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST api/sessions/create-meeting/:id
// @desc    Create Zoom meeting for a session (teacher only, on-demand)
router.post('/create-meeting/:id', auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ msg: 'Session not found' });
  }

  try {
    const session = await Session.findById(req.params.id)
      .populate('learner', 'username')
      .populate('teacher', 'username');

    if (!session || !session.learner || !session.teacher) {
      return res.status(404).json({ msg: 'Session not found' });
    }
    if (session.teacher._id.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Only the teacher can create the meeting' });
    }
    if (session.status !== 'confirmed') {
      return res.status(400).json({ msg: 'Only confirmed sessions can have meetings' });
    }

    if (session.meetingLink) {
      return res.json({
        meetingLink: session.meetingLink,
        startUrl: session.startUrl,
        message: 'Meeting already exists',
      });
    }

    let zoomMeeting;
    try {
      const topic = `SkillSwap: ${session.skill} (${session.teacher.username} & ${session.learner.username})`;
      zoomMeeting = await createZoomMeeting(
        topic,
        session.scheduledTime || new Date(),
        Math.round((session.durationHours || 1) * 60)
      );
    } catch (zoomErr) {
      console.error('Zoom API failed:', zoomErr.message);
      return res.status(502).json({ msg: 'Could not create Zoom meeting' });
    }

    session.meetingLink = zoomMeeting.join_url;
    session.startUrl = zoomMeeting.start_url;

    if (session.calendarEventId && session.calendarProvider) {
      try {
        await calendarService.updateEvent(session.teacher._id, session, session.calendarProvider);
      } catch (calendarErr) {
        console.error('Error updating calendar event with meeting link:', calendarErr.message);
      }
    }

    await session.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${session.learner._id}`).emit('meetingCreated', {
        sessionId: session._id,
        meetingLink: zoomMeeting.join_url,
        skill: session.skill,
        teacher: session.teacher.username,
        notifyUserId: session.learner._id.toString(),
      });
    }
    notify(req, session.learner._id, {
      type: 'meeting',
      title: 'Meeting started',
      message: `${session.teacher.username} started your ${session.skill} session. Join it from your dashboard.`,
      link: '/dashboard',
    });

    res.json({
      meetingLink: zoomMeeting.join_url,
      startUrl: zoomMeeting.start_url,
      message: 'Meeting created successfully',
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/sessions/reschedule/:id
// @desc    Reschedule a confirmed session (teacher or learner)
router.put('/reschedule/:id', auth, async (req, res) => {
  const { scheduledTime, durationHours } = req.body;

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ msg: 'Session not found' });
  }

  const newTime = parseFutureDate(scheduledTime);
  if (!newTime) {
    return res.status(400).json({ msg: 'New scheduled time must be a valid date in the future' });
  }
  let newDuration = null;
  if (durationHours !== undefined && durationHours !== null && durationHours !== '') {
    newDuration = parseDuration(durationHours);
    if (!newDuration) {
      return res.status(400).json({ msg: 'Duration must be between 0.5 and 8 hours' });
    }
  }

  try {
    const session = await Session.findById(req.params.id)
      .populate('learner', 'username')
      .populate('teacher', 'username');

    if (!session || !session.learner || !session.teacher) {
      return res.status(404).json({ msg: 'Session not found' });
    }
    if (!isSessionMember(session, req.user.id)) {
      return res.status(403).json({ msg: 'Only the teacher or learner can reschedule sessions' });
    }
    if (session.status !== 'confirmed') {
      return res.status(400).json({ msg: 'Only confirmed sessions can be rescheduled' });
    }
    if (session.paymentType === 'credits' && newDuration && newDuration !== session.durationHours) {
      return res.status(400).json({
        msg: 'The length of a credit session cannot be changed because its credits are already reserved. Cancel it (credits are refunded) and book a new one instead.',
      });
    }

    session.scheduledTime = newTime;
    if (newDuration) {
      session.durationHours = newDuration;
    }
    // The old Zoom meeting no longer matches; the teacher creates a new one when starting
    session.meetingLink = null;
    session.startUrl = null;
    // Reminders are sent again for the new time
    session.reminder24hSentAt = null;
    session.reminder1hSentAt = null;

    const teacher = await User.findById(session.teacher._id).select('calendarProvider');
    if (session.calendarEventId && session.calendarProvider && teacher?.calendarProvider === session.calendarProvider) {
      try {
        const result = await calendarService.updateEvent(teacher._id, session, session.calendarProvider);
        session.calendarEventId = result.eventId;
        session.calendarLink = result.htmlLink || result.webLink;
      } catch (calendarErr) {
        console.error('Error updating calendar event:', calendarErr.message);
      }
    } else if (!session.calendarEventId) {
      await attachCalendarEvent(session, teacher);
    }

    await session.save();

    const isTeacher = session.teacher._id.toString() === req.user.id;
    const actor = isTeacher ? session.teacher : session.learner;
    const other = isTeacher ? session.learner : session.teacher;
    const otherProfile = await User.findById(other._id).select('availability');
    notify(req, other._id, {
      type: 'session_update',
      title: 'Session rescheduled',
      message: `${actor.username} moved your ${session.skill} session to ${formatInTimezone(newTime, otherProfile?.availability?.timeZone)}.`,
      link: '/requests',
    });

    res.json(session);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/sessions/cancel/:id
// @desc    Cancel a confirmed session (teacher or learner)
router.put('/cancel/:id', auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ msg: 'Session not found' });
  }

  try {
    const session = await Session.findById(req.params.id)
      .populate('learner', 'username')
      .populate('teacher', 'username');

    if (!session || !session.learner || !session.teacher) {
      return res.status(404).json({ msg: 'Session not found' });
    }
    if (!isSessionMember(session, req.user.id)) {
      return res.status(403).json({ msg: 'User not authorized' });
    }
    if (session.status !== 'confirmed') {
      return res.status(400).json({ msg: 'Only confirmed sessions can be cancelled' });
    }

    await removeCalendarEvent(session);

    // Atomic transition: a session can't be both cancelled (refunded) and completed (paid out)
    const before = await Session.findOneAndUpdate(
      { _id: session._id, status: 'confirmed' },
      {
        $set: {
          status: 'cancelled',
          creditsHeld: 0,
          calendarEventId: null,
          calendarProvider: null,
          calendarLink: null,
          meetingLink: null,
          startUrl: null,
        },
      },
      { new: false }
    );
    if (!before) {
      return res.status(400).json({ msg: 'This session was already completed or cancelled' });
    }
    session.status = 'cancelled';

    if (before.creditsHeld > 0) {
      await adjustCredits({
        io: req.app.get('io'),
        userId: session.learner._id,
        amount: before.creditsHeld,
        type: 'refund',
        description: `Refund: cancelled ${session.skill} session with ${session.teacher.username}`,
        sessionId: session._id,
      });
      notify(req, session.learner._id, {
        type: 'credits',
        title: 'Credits refunded',
        message: `${formatCredits(before.creditsHeld)} returned for the cancelled ${session.skill} session.`,
        link: '/credits',
      });
    }

    const cancelledByTeacher = session.teacher._id.toString() === req.user.id;
    const canceller = cancelledByTeacher ? session.teacher : session.learner;
    const otherParty = cancelledByTeacher ? session.learner : session.teacher;
    const otherPartyProfile = await User.findById(otherParty._id).select('availability');
    notify(req, otherParty._id, {
      type: 'session_update',
      title: 'Session cancelled',
      message: `${canceller.username} cancelled the ${session.skill} session on ${formatInTimezone(session.scheduledTime, otherPartyProfile?.availability?.timeZone)}.`,
      link: '/requests',
    });

    res.json(session);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/sessions/complete/:id
// @desc    Mark a session as completed (teacher only, once the session has started)
router.put('/complete/:id', auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ msg: 'Session not found' });
  }

  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ msg: 'Session not found' });
    }
    if (!session.teacher || session.teacher.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Only the teacher can mark a session as complete' });
    }
    if (session.status !== 'confirmed') {
      return res.status(400).json({ msg: 'Only confirmed sessions can be marked as complete' });
    }
    if (!session.scheduledTime || session.scheduledTime > new Date()) {
      return res.status(400).json({ msg: 'A session can only be completed after it has started' });
    }

    // Atomic status transition so a double click cannot award hours or credits twice
    const before = await Session.findOneAndUpdate(
      { _id: session._id, status: 'confirmed' },
      { $set: { status: 'completed', teacherReviewed: false, learnerReviewed: false, creditsHeld: 0 } },
      { new: false }
    );
    if (!before) {
      return res.status(400).json({ msg: 'Session already marked as complete' });
    }
    const completed = await Session.findById(session._id);

    // Pay the teacher the credits that were reserved for this session
    if (before.creditsHeld > 0) {
      const learner = await User.findById(completed.learner).select('username');
      await adjustCredits({
        io: req.app.get('io'),
        userId: completed.teacher,
        amount: before.creditsHeld,
        type: 'earning',
        description: `Taught ${completed.skill} to ${learner?.username || 'a learner'}`,
        sessionId: completed._id,
      });
      notify(req, completed.teacher, {
        type: 'credits',
        title: 'Credits earned',
        message: `You earned ${formatCredits(before.creditsHeld)} for teaching ${completed.skill}.`,
        link: '/credits',
      });
    }

    const hours = completed.durationHours || 1;
    await User.findByIdAndUpdate(completed.teacher, { $inc: { hoursTaught: hours } });
    await User.findByIdAndUpdate(completed.learner, { $inc: { hoursLearned: hours } });

    await updateStreak(completed.teacher);
    await updateStreak(completed.learner);

    res.json(completed);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/sessions/reviews
// @desc    Submit a review for a completed session
router.post('/reviews', auth, async (req, res) => {
  const { sessionId, revieweeId, rating } = req.body;
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 500) : '';
  const reviewerId = req.user.id;

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ msg: 'Rating must be a whole number between 1 and 5' });
  }
  if (!mongoose.isValidObjectId(sessionId) || !mongoose.isValidObjectId(revieweeId)) {
    return res.status(400).json({ msg: 'Invalid session or reviewee' });
  }

  try {
    const session = await Session.findById(sessionId);
    if (!session || session.status !== 'completed') {
      return res.status(400).json({ msg: 'Cannot review an uncompleted or non-existent session' });
    }

    const teacherId = session.teacher.toString();
    const learnerId = session.learner.toString();
    if (reviewerId !== teacherId && reviewerId !== learnerId) {
      return res.status(403).json({ msg: 'User not authorized to review this session' });
    }
    if (revieweeId !== teacherId && revieweeId !== learnerId) {
      return res.status(400).json({ msg: 'Reviewee is not part of this session' });
    }
    if (reviewerId === revieweeId) {
      return res.status(400).json({ msg: 'Cannot review yourself' });
    }

    const isTeacher = reviewerId === teacherId;
    const existingReview = await Review.findOne({ sessionId, reviewerId });
    if (existingReview) {
      // Keep the session flags consistent with the stored review
      const flag = isTeacher ? 'teacherReviewed' : 'learnerReviewed';
      if (!session[flag]) {
        session[flag] = true;
        await session.save();
      }
      return res.status(400).json({ msg: 'You have already reviewed this session' });
    }

    let newReview;
    try {
      newReview = await new Review({
        sessionId,
        reviewerId,
        revieweeId,
        rating: ratingNum,
        comment,
      }).save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        return res.status(400).json({ msg: 'You have already reviewed this session' });
      }
      throw saveErr;
    }

    session[isTeacher ? 'teacherReviewed' : 'learnerReviewed'] = true;
    await session.save();

    const reviewee = await User.findById(revieweeId).select('averageRating totalRatings');
    if (reviewee) {
      const currentTotal = reviewee.totalRatings || 0;
      const totalRatings = currentTotal + 1;
      const averageRating = ((reviewee.averageRating || 0) * currentTotal + ratingNum) / totalRatings;
      await User.findByIdAndUpdate(
        revieweeId,
        { $set: { averageRating, totalRatings } },
        { runValidators: false }
      );
    }

    const reviewer = await User.findById(reviewerId).select('username');
    notify(req, revieweeId, {
      type: 'review',
      title: 'New review',
      message: `${reviewer.username} gave you ${ratingNum} star${ratingNum !== 1 ? 's' : ''} for ${session.skill}.`,
      link: '/profile',
    });

    res.json(newReview);
  } catch (err) {
    console.error('Error in review submission:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;
