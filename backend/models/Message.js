const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'conversation',
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
    },
    content: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('message', MessageSchema);