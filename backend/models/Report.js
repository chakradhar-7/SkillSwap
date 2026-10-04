const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'conversation',
  },
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'message',
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'harassment',
      'spam',
      'inappropriate_content',
      'scam',
      'fake_profile',
      'other'
    ],
  },
  description: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'reviewing', 'resolved', 'dismissed'],
    default: 'pending',
  },
  adminNotes: {
    type: String,
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
  },
  resolvedAt: {
    type: Date,
  },
}, { timestamps: true });

ReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('report', ReportSchema);

