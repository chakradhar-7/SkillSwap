const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  learner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
  },
  skill: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending',
  },
  requestedDate: {
    type: Date,
    default: Date.now,
  },
  scheduledTime: {
    type: Date,
  },
  // Optional time suggested by the learner when requesting; the teacher sets the real schedule
  proposedTime: {
    type: Date,
  },
  proposedDurationHours: {
    type: Number,
  },
  durationHours: {
    type: Number,
    default: 1,
  },
  meetingLink: {
    type: String,
  },
  startUrl: {
    type: String,
  },
  teacherReviewed: {
    type: Boolean,
    default: false,
  },
  learnerReviewed: {
    type: Boolean,
    default: false,
  },
  calendarEventId: {
    type: String,
  },
  calendarProvider: {
    type: String,
    enum: ['google', 'outlook', null],
    default: null,
  },
  calendarLink: {
    type: String,
  },
  // 'barter': the teacher learns a skill back; 'credits': the learner pays time credits
  paymentType: {
    type: String,
    enum: ['barter', 'credits'],
    default: 'barter',
  },
  // Credits reserved from the learner for this session; paid to the teacher on
  // completion or refunded on cancellation
  creditsHeld: {
    type: Number,
    default: 0,
  },
  // When reminder notifications were sent (cleared when the session is rescheduled)
  reminder24hSentAt: {
    type: Date,
    default: null,
  },
  reminder1hSentAt: {
    type: Date,
    default: null,
  },
  // Barter system: Link to the paired session
  barterSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'session',
    default: null,
  },
});

SessionSchema.index({ learner: 1, status: 1 });
SessionSchema.index({ teacher: 1, status: 1 });
SessionSchema.index({ status: 1, scheduledTime: 1 });

module.exports = mongoose.model('session', SessionSchema);