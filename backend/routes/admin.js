const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/admin');
const User = require('../models/User');
const Report = require('../models/Report');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Session = require('../models/Session');
const escapeRegex = require('../utils/escapeRegex');

const parsePaging = (query, defaultLimit) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), 100);
  return { page, limit };
};

// Force-disconnect a user's live sockets (used after a ban)
const disconnectUser = (req, userId) => {
  const io = req.app.get('io');
  if (io) io.in(`user_${userId}`).disconnectSockets(true);
};

// All admin routes require both auth and admin middleware
router.use(auth, adminAuth);

// Reject malformed ids up front instead of failing with a CastError
router.param('id', (req, res, next, id) =>
  mongoose.isValidObjectId(id) ? next() : res.status(404).json({ msg: 'Not found' })
);

// @route   GET api/admin/dashboard
// @desc    Get admin dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    // Count users excluding admins
    const totalUsers = await User.countDocuments({ 
      $or: [
        { role: { $ne: 'admin' } },
        { role: { $exists: false } }
      ]
    });
    const bannedUsers = await User.countDocuments({ isBanned: true });
    const timedOutUsers = await User.countDocuments({ 
      isTimedOut: true,
      timeoutUntil: { $gt: new Date() }
    });
    const activeUsers = totalUsers - bannedUsers - timedOutUsers;
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    const totalReports = await Report.countDocuments();
    const totalSessions = await Session.countDocuments();
    const totalConversations = await Conversation.countDocuments();
    
    // Recent activity
    const recentReports = await Report.find()
      .populate('reportedBy', 'username email')
      .populate('reportedUser', 'username email')
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.json({
      stats: {
        totalUsers,
        activeUsers,
        bannedUsers,
        timedOutUsers,
        pendingReports,
        totalReports,
        totalSessions,
        totalConversations,
      },
      recentReports,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/reports
// @desc    Get all reports with filters
router.get('/reports', async (req, res) => {
  try {
    const { status } = req.query;
    const { page, limit } = parsePaging(req.query, 20);
    let query = {};
    if (status && status !== 'all') {
      if (!['pending', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
        return res.status(400).json({ msg: 'Invalid status filter' });
      }
      // Combine pending and reviewing as "pending"
      if (status === 'pending') {
        query = { status: { $in: ['pending', 'reviewing'] } };
      } else {
        query = { status };
      }
    }
    
    const reports = await Report.find(query)
      .populate('reportedBy', 'username email _id')
      .populate('reportedUser', 'username email _id isBanned')
      .populate('conversationId', '_id')
      .populate('messageId', 'content')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);
    
    const total = await Report.countDocuments(query);
    
    res.json({
      reports,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/reports/:id
// @desc    Get single report with full details
router.get('/reports/:id', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('reportedBy', 'username email _id')
      .populate('reportedUser', 'username email _id isBanned role')
      .populate('conversationId', '_id participants')
      .populate('messageId', 'content sender createdAt');
    
    if (!report) {
      return res.status(404).json({ msg: 'Report not found' });
    }
    
    // Get conversation messages if conversationId exists
    let messages = [];
    if (report.conversationId) {
      messages = await Message.find({ conversationId: report.conversationId._id })
        .populate('sender', 'username email _id')
        .sort({ createdAt: 1 });
    }
    
    res.json({
      report,
      messages,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/admin/reports/:id/resolve
// @desc    Resolve a report
router.put('/reports/:id/resolve', async (req, res) => {
  try {
    const { status, adminNotes, action } = req.body;
    
    if (!['resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ msg: 'Invalid status' });
    }
    
    const report = await Report.findById(req.params.id)
      .populate('reportedUser', '_id');
    
    if (!report) {
      return res.status(404).json({ msg: 'Report not found' });
    }
    if (!['pending', 'reviewing'].includes(report.status)) {
      return res.status(400).json({ msg: 'This report has already been handled' });
    }
    
    report.status = status;
    report.adminNotes = adminNotes || '';
    report.resolvedBy = req.user.id;
    report.resolvedAt = new Date();
    
    await report.save();
    
    // If action is 'ban', ban the reported user
    if (action === 'ban' && report.reportedUser) {
      const userToBan = await User.findById(report.reportedUser._id);
      if (userToBan) {
        userToBan.isBanned = true;
        userToBan.banReason = adminNotes || `Banned due to report: ${report.reason}`;
        userToBan.bannedAt = new Date();
        userToBan.bannedBy = req.user.id;
        await userToBan.save();
        disconnectUser(req, userToBan._id);
        
        // Emit socket event for user ban
        const io = req.app.get('io');
        if (io) {
          io.to('admin_room').emit('userBanned', {
            userId: userToBan._id,
            username: userToBan.username,
            banReason: userToBan.banReason
          });
        }
      }
    }
    
    // Emit socket events for report resolution
    const io = req.app.get('io');
    if (io) {
      const populatedReport = await Report.findById(report._id)
        .populate('reportedBy', 'username email')
        .populate('reportedUser', 'username email isBanned');
      
      io.to('admin_room').emit('reportResolved', populatedReport);
      io.to('admin_room').emit('dashboardUpdate');
    }
    
    res.json({ msg: 'Report resolved successfully', report });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/users
// @desc    Get all users with filters
router.get('/users', async (req, res) => {
  try {
    const { isBanned } = req.query;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const { page, limit } = parsePaging(req.query, 50);
    
    // Build base query - exclude admins
    const baseQuery = {
      $or: [
        { role: { $ne: 'admin' } },
        { role: { $exists: false } }
      ]
    };
    
    // Add ban filter
    if (isBanned === 'true') {
      baseQuery.isBanned = true;
    } else if (isBanned === 'false') {
      baseQuery.isBanned = { $ne: true };
    }
    
    // Build final query
    let finalQuery = baseQuery;
    if (search) {
      finalQuery = {
        $and: [
          baseQuery,
          {
            $or: [
              { username: { $regex: escapeRegex(search), $options: 'i' } },
              { email: { $regex: escapeRegex(search), $options: 'i' } },
            ]
          }
        ]
      };
    }
    
    const users = await User.find(finalQuery)
      .select('-password -googleCalendarToken -googleCalendarRefreshToken -outlookCalendarToken -outlookCalendarRefreshToken')
      .populate('bannedBy', 'username')
      .populate('timedOutBy', 'username')
      .sort({ date: -1 })
      .limit(limit)
      .skip((page - 1) * limit);
    
    const total = await User.countDocuments(finalQuery);
    
    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (err) {
    console.error('Error in admin/users:', err);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/users/:id
// @desc    Get single user details
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -googleCalendarToken -googleCalendarRefreshToken -outlookCalendarToken -outlookCalendarRefreshToken')
      .populate('bannedBy', 'username email')
      .populate('timedOutBy', 'username email');
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    // Get user's reports (both as reporter and reported)
    const reportsAsReporter = await Report.find({ reportedBy: user._id })
      .populate('reportedUser', 'username email')
      .sort({ createdAt: -1 });
    
    const reportsAsReported = await Report.find({ reportedUser: user._id })
      .populate('reportedBy', 'username email')
      .sort({ createdAt: -1 });
    
    // Get user's sessions
    const sessions = await Session.find({
      $or: [{ learner: user._id }, { teacher: user._id }],
    })
      .populate('learner', 'username')
      .populate('teacher', 'username')
      .sort({ requestedDate: -1 })
      .limit(10);
    
    res.json({
      user,
      reportsAsReporter,
      reportsAsReported,
      sessions,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/admin/users/:id/ban
// @desc    Ban or unban a user
router.put('/users/:id/ban', async (req, res) => {
  try {
    const { isBanned, banReason } = req.body;
    if (typeof isBanned !== 'boolean') {
      return res.status(400).json({ msg: 'isBanned must be true or false' });
    }
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    if (user.role === 'admin') {
      return res.status(400).json({ msg: 'Cannot ban admin users' });
    }
    
    user.isBanned = isBanned;
    if (isBanned) {
      user.banReason = banReason || 'No reason provided';
      user.bannedAt = new Date();
      user.bannedBy = req.user.id;
    } else {
      user.banReason = null;
      user.bannedAt = null;
      user.bannedBy = null;
    }
    
    await user.save();
    if (isBanned) {
      disconnectUser(req, user._id);
    }
    
    // Emit socket event for user ban/unban
    const io = req.app.get('io');
    if (io) {
      if (isBanned) {
        io.to('admin_room').emit('userBanned', {
          userId: user._id,
          username: user.username,
          banReason: user.banReason
        });
      } else {
        io.to('admin_room').emit('userUnbanned', {
          userId: user._id,
          username: user.username
        });
      }
      io.to('admin_room').emit('dashboardUpdate');
    }
    
    res.json({ 
      msg: isBanned ? 'User banned successfully' : 'User unbanned successfully',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        isBanned: user.isBanned,
        banReason: user.banReason,
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/conversations/:id
// @desc    Get conversation details with messages (for moderation)
router.get('/conversations/:id', async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('participants', 'username email _id isBanned')
      .populate('requestedBy', 'username email');
    
    if (!conversation) {
      return res.status(404).json({ msg: 'Conversation not found' });
    }
    
    const messages = await Message.find({ conversationId: req.params.id })
      .populate('sender', 'username email _id')
      .sort({ createdAt: 1 });
    
    res.json({
      conversation,
      messages,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/admin/users/:id/timeout
// @desc    Timeout a user (restrict from chatting for specified days)
router.put('/users/:id/timeout', async (req, res) => {
  try {
    const { days, reason } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    if (user.role === 'admin') {
      return res.status(400).json({ msg: 'Cannot timeout admin users' });
    }
    
    const timeoutDays = parseInt(days, 10);
    if (!Number.isInteger(timeoutDays) || timeoutDays < 1 || timeoutDays > 365) {
      return res.status(400).json({ msg: 'Invalid timeout duration. Must be between 1 and 365 days.' });
    }
    
    const timeoutUntil = new Date();
    timeoutUntil.setDate(timeoutUntil.getDate() + timeoutDays);
    
    user.isTimedOut = true;
    user.timeoutUntil = timeoutUntil;
    user.timeoutReason = reason || 'No reason provided';
    user.timedOutAt = new Date();
    user.timedOutBy = req.user.id;
    
    await user.save();
    
    // Emit socket event for user timeout
    const io = req.app.get('io');
    if (io) {
      io.to('admin_room').emit('userTimedOut', {
        userId: user._id,
        username: user.username,
        days: timeoutDays,
        timeoutUntil: user.timeoutUntil,
        timeoutReason: user.timeoutReason
      });
      io.to('admin_room').emit('dashboardUpdate');
    }
    
    res.json({ 
      msg: `User timed out successfully for ${timeoutDays} day(s)`,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        isTimedOut: user.isTimedOut,
        timeoutUntil: user.timeoutUntil,
        timeoutReason: user.timeoutReason,
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/admin/users/:id/remove-timeout
// @desc    Remove timeout from a user
router.put('/users/:id/remove-timeout', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    user.isTimedOut = false;
    user.timeoutUntil = null;
    user.timeoutReason = null;
    user.timedOutBy = null;
    user.timedOutAt = null;
    
    await user.save();
    
    // Emit socket event for timeout removal
    const io = req.app.get('io');
    if (io) {
      io.to('admin_room').emit('userTimeoutRemoved', {
        userId: user._id,
        username: user.username
      });
      io.to('admin_room').emit('dashboardUpdate');
    }
    
    res.json({ 
      msg: 'User timeout removed successfully',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        isTimedOut: user.isTimedOut,
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/admin/messages/:id
// @desc    Delete a message (moderation action)
router.delete('/messages/:id', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ msg: 'Message not found' });
    }
    
    await Message.findByIdAndDelete(req.params.id);
    
    res.json({ msg: 'Message deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;

