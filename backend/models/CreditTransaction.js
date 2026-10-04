const mongoose = require('mongoose');

// Ledger of every change to a user's time-credit balance
const CreditTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
    // Positive = received, negative = spent
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    // 'welcome' | 'payment' | 'earning' | 'refund'
    type: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'session',
      default: null,
    },
  },
  { timestamps: true }
);

CreditTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('creditTransaction', CreditTransactionSchema);
