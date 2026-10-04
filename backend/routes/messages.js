const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const chatAllowed = require('../middleware/chatAllowed');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Report = require('../models/Report');
const User = require('../models/User');
const { notify } = require('../services/notificationService');

const REPORT_REASONS = ['harassment', 'spam', 'inappropriate_content', 'scam', 'fake_profile', 'other'];

const isParticipant = (conversation, userId) =>
  conversation.participants.some((p) => (p._id || p).toString() === userId);

const emitToUser = (req, userId, event, payload) => {
  const io = req.app.get('io');
  if (io) io.to(`user_${userId}`).emit(event, payload);
};

// @route   POST api/messages/request/:recipientId
// @desc    Send a chat request to a recipient. If the recipient already sent
//          us a request, this accepts it instead.
router.post('/request/:recipientId', auth, chatAllowed, async (req, res) => {
  try {
    const { recipientId } = req.params;
    const senderId = req.user.id;

    if (!mongoose.isValidObjectId(recipientId)) {
      return res.status(400).json({ msg: 'Invalid recipient' });
    }
    if (senderId === recipientId) {
      return res.status(400).json({ msg: 'Cannot send chat request to yourself' });
    }

    const recipient = await User.findById(recipientId).select('isBanned role');
    if (!recipient || recipient.isBanned) {
      return res.status(404).json({ msg: 'User not found' });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, recipientId] },
    });

    if (conversation) {
      if (conversation.status === 'accepted') {
        return res.status(400).json({ msg: 'You are already connected with this user' });
      }
      if (conversation.status === 'pending') {
        if (conversation.requestedBy && conversation.requestedBy.toString() === senderId) {
          return res.status(400).json({ msg: 'Chat request already sent' });
        }
        // The other user already asked us - treat this as an acceptance
        conversation.status = 'accepted';
        await conversation.save();
        [senderId, recipientId].forEach((id) => {
          emitToUser(req, id, 'conversationUpdate');
          emitToUser(req, id, 'chatRequestAccepted', { conversationId: conversation._id });
        });
        const accepter = await User.findById(senderId).select('username');
        notify(req, recipientId, {
          type: 'chat_request',
          title: 'Chat request accepted',
          message: `${accepter.username} accepted your chat request. You can now message each other.`,
          link: `/messages?conversation=${conversation._id}`,
        });
        return res.json(conversation);
      }
      // Previously rejected - allow a fresh request
      conversation.status = 'pending';
      conversation.requestedBy = senderId;
      await conversation.save();
    } else {
      conversation = new Conversation({
        participants: [senderId, recipientId],
        status: 'pending',
        requestedBy: senderId,
      });
      await conversation.save();
    }

    emitToUser(req, recipientId, 'newChatRequest', { conversationId: conversation._id });
    emitToUser(req, recipientId, 'conversationUpdate');
    const sender = await User.findById(senderId).select('username');
    notify(req, recipientId, {
      type: 'chat_request',
      title: 'New chat request',
      message: `${sender.username} wants to connect with you.`,
      link: '/messages',
    });
    res.json(conversation);
  } catch (err) {
    console.error('Error in chat request:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   GET api/messages/start/:recipientId
// @desc    Look up the existing conversation with a recipient (null if none).
//          Conversations are only created through chat requests.
router.get('/start/:recipientId', auth, async (req, res) => {
  try {
    const { recipientId } = req.params;
    if (!mongoose.isValidObjectId(recipientId)) {
      return res.status(400).json({ msg: 'Invalid recipient' });
    }

    const conversation = await Conversation.findOne({
      participants: { $all: [req.user.id, recipientId] },
    });
    res.json(conversation || null);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/messages/requests/pending
// @desc    Get pending chat requests (incoming and outgoing)
router.get('/requests/pending', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const allConversations = await Conversation.find({
      participants: userId,
      status: 'pending',
    })
      .populate('participants', 'username')
      .populate('requestedBy', 'username')
      .sort({ createdAt: -1 });

    const incoming = [];
    const outgoing = [];

    allConversations.forEach((convo) => {
      const otherParticipant = convo.participants.find((p) => p._id.toString() !== userId);
      const convoData = {
        _id: convo._id,
        participant: otherParticipant || { username: 'Unknown' },
        createdAt: convo.createdAt,
      };

      if (convo.requestedBy && convo.requestedBy._id.toString() === userId) {
        outgoing.push(convoData);
      } else {
        incoming.push(convoData);
      }
    });

    res.json({ incoming, outgoing });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/messages/requests/:conversationId/accept
// @desc    Accept a chat request
router.post('/requests/:conversationId/accept', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(404).json({ msg: 'Conversation not found' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ msg: 'Conversation not found' });
    }
    if (!isParticipant(conversation, userId)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    if (conversation.status === 'accepted') {
      return res.status(400).json({ msg: 'Chat request already accepted' });
    }
    if (conversation.requestedBy && conversation.requestedBy.toString() === userId) {
      return res.status(400).json({ msg: 'Cannot accept your own request' });
    }

    conversation.status = 'accepted';
    await conversation.save();

    conversation.participants.forEach((participantId) => {
      emitToUser(req, participantId, 'conversationUpdate');
      emitToUser(req, participantId, 'chatRequestAccepted', { conversationId });
    });

    if (conversation.requestedBy) {
      const accepter = await User.findById(userId).select('username');
      notify(req, conversation.requestedBy, {
        type: 'chat_request',
        title: 'Chat request accepted',
        message: `${accepter.username} accepted your chat request. You can now message each other.`,
        link: `/messages?conversation=${conversation._id}`,
      });
    }

    res.json(conversation);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/messages/requests/:conversationId/reject
// @desc    Reject a chat request
router.post('/requests/:conversationId/reject', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(404).json({ msg: 'Conversation not found' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ msg: 'Conversation not found' });
    }
    if (!isParticipant(conversation, userId)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    if (conversation.status !== 'pending') {
      return res.status(400).json({ msg: 'Only pending requests can be rejected' });
    }
    if (conversation.requestedBy && conversation.requestedBy.toString() === userId) {
      return res.status(400).json({ msg: 'Cannot reject your own request' });
    }

    conversation.status = 'rejected';
    await conversation.save();

    if (conversation.requestedBy) {
      emitToUser(req, conversation.requestedBy, 'chatRequestRejected', { conversationId });
      emitToUser(req, conversation.requestedBy, 'conversationUpdate');
    }

    res.json(conversation);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/messages/conversations/my
// @desc    Get all accepted conversations for the logged-in user
router.get('/conversations/my', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user.id,
      status: 'accepted',
    })
      .populate({ path: 'participants', select: 'username' })
      .sort({ updatedAt: -1 });

    const conversationsWithMessages = await Promise.all(
      conversations.map(async (convo) => {
        const lastMessage = await Message.findOne({ conversationId: convo._id })
          .populate('sender', 'username')
          .sort({ createdAt: -1 })
          .lean();

        const otherParticipant = convo.participants.find(
          (p) => p && p._id.toString() !== req.user.id
        );

        return {
          _id: convo._id,
          updatedAt: convo.updatedAt,
          participant: otherParticipant || { username: 'Unknown User' },
          lastMessage: lastMessage || null,
        };
      })
    );

    res.json(conversationsWithMessages);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/messages/report
// @desc    Report a user or message
router.post('/report', auth, async (req, res) => {
  try {
    const { reportedUserId, conversationId, messageId, reason } = req.body;
    const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 2000) : '';

    if (!reportedUserId || !reason || !description) {
      return res.status(400).json({ msg: 'Missing required fields' });
    }
    if (!REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ msg: 'Invalid report reason' });
    }
    if (!mongoose.isValidObjectId(reportedUserId)) {
      return res.status(400).json({ msg: 'Invalid user' });
    }
    if (reportedUserId === req.user.id) {
      return res.status(400).json({ msg: 'Cannot report yourself' });
    }

    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({ msg: 'Reported user not found' });
    }

    if (conversationId) {
      if (!mongoose.isValidObjectId(conversationId)) {
        return res.status(400).json({ msg: 'Invalid conversation' });
      }
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ msg: 'Conversation not found' });
      }
      if (!isParticipant(conversation, req.user.id) || !isParticipant(conversation, reportedUserId)) {
        return res.status(403).json({ msg: 'Not authorized to report this conversation' });
      }
    }

    if (messageId) {
      if (!mongoose.isValidObjectId(messageId)) {
        return res.status(400).json({ msg: 'Invalid message' });
      }
      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({ msg: 'Message not found' });
      }
      if (!conversationId || message.conversationId.toString() !== conversationId) {
        return res.status(400).json({ msg: 'Message does not belong to this conversation' });
      }
    }

    const report = new Report({
      reportedBy: req.user.id,
      reportedUser: reportedUserId,
      conversationId: conversationId || null,
      messageId: messageId || null,
      reason,
      description,
      status: 'pending',
    });
    await report.save();

    const populatedReport = await Report.findById(report._id)
      .populate('reportedBy', 'username email')
      .populate('reportedUser', 'username email isBanned');

    const io = req.app.get('io');
    if (io) {
      io.to('admin_room').emit('newReport', populatedReport);
      io.to('admin_room').emit('dashboardUpdate');
    }

    res.json({ msg: 'Report submitted successfully. Our team will review it.', report });
  } catch (err) {
    console.error('Error creating report:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   GET api/messages/:conversationId
// @desc    Get all messages for a conversation
router.get('/:conversationId', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(404).json({ msg: 'Conversation not found' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ msg: 'Conversation not found' });
    }
    if (!isParticipant(conversation, req.user.id)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    if (conversation.status !== 'accepted') {
      return res.status(403).json({ msg: 'Chat request not accepted yet' });
    }

    const messages = await Message.find({ conversationId })
      .populate('sender', 'username')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
