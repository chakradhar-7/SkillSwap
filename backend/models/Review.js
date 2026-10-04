const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'session',
    required: true,
  },
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },
  revieweeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  comment: {
    type: String,
    maxlength: 500,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

ReviewSchema.index({ sessionId: 1, reviewerId: 1 }, { unique: true });
ReviewSchema.index({ revieweeId: 1, date: -1 });

module.exports = mongoose.model('review', ReviewSchema);