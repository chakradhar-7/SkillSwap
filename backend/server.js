require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

const Message = require('./models/Message');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const { getChatRestriction } = require('./utils/moderation');
const { isIssuedBeforePasswordChange } = require('./utils/tokens');
const { startReminderService } = require('./services/reminderService');
const { grantStartingCreditsToExistingUsers } = require('./services/creditService');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy backend/.env.example to backend/.env and fill it in.');
  process.exit(1);
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const MAX_MESSAGE_LENGTH = 2000;

// Connect to Database, then run one-time data upgrades
connectDB()
  .then(() => grantStartingCreditsToExistingUsers())
  .catch((err) => console.error('Startup data upgrade failed:', err.message));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
});

// Init Middleware
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json({ limit: '100kb' }));

// Make io accessible to routes
app.set('io', io);

// Define Routes
app.get('/', (req, res) => res.send('SkillSwap API Running'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/skills', require('./routes/skills'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/credits', require('./routes/credits'));

// Unknown API routes
app.use('/api', (req, res) => res.status(404).json({ msg: 'Not found' }));

// Return JSON errors (e.g. malformed request bodies) instead of HTML stack traces
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ msg: 'Invalid JSON in request body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ msg: 'Request body is too large' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ msg: 'Server error' });
});

// --- Socket.IO ---

// userId -> number of open sockets (a user can have several tabs open)
const onlineUsers = new Map();

// Every socket must authenticate with the same JWT the REST API uses.
// The user id is taken from the token, never from client-sent data.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.user.id).select('role isBanned passwordChangedAt');
    if (!user || user.isBanned || isIssuedBeforePasswordChange(decoded, user)) {
      return next(new Error('Not authorized'));
    }
    socket.userId = user._id.toString();
    socket.userRole = user.role;
    next();
  } catch (err) {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  const { userId } = socket;

  socket.join(`user_${userId}`);
  if (socket.userRole === 'admin') {
    socket.join('admin_room');
  }

  const openSockets = onlineUsers.get(userId) || 0;
  onlineUsers.set(userId, openSockets + 1);
  if (openSockets === 0) {
    socket.broadcast.emit('userOnline', userId);
  }
  socket.emit('onlineUsers', [...onlineUsers.keys()]);

  socket.on('sendMessage', async (payload = {}) => {
    try {
      const { conversationId } = payload;
      const content = typeof payload.content === 'string' ? payload.content.trim() : '';

      if (!content) {
        return;
      }
      if (content.length > MAX_MESSAGE_LENGTH) {
        socket.emit('chatError', { msg: `Messages can be at most ${MAX_MESSAGE_LENGTH} characters` });
        return;
      }
      if (!mongoose.isValidObjectId(conversationId)) {
        socket.emit('chatError', { msg: 'Conversation not found' });
        return;
      }

      const sender = await User.findById(userId);
      const restriction = await getChatRestriction(sender);
      if (restriction) {
        socket.emit('chatError', restriction);
        return;
      }

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        socket.emit('chatError', { msg: 'Conversation not found' });
        return;
      }
      if (!conversation.participants.some((p) => p.toString() === userId)) {
        socket.emit('chatError', { msg: 'Not authorized' });
        return;
      }
      if (conversation.status !== 'accepted') {
        socket.emit('chatError', { msg: 'Chat request not accepted yet' });
        return;
      }

      const newMessage = await new Message({
        conversationId,
        sender: userId,
        content,
      }).save();

      await Conversation.findByIdAndUpdate(conversationId, { updatedAt: new Date() });

      const populatedMessage = await Message.findById(newMessage._id).populate('sender', 'username');

      // Deliver only to the participants' personal rooms
      conversation.participants.forEach((participantId) => {
        io.to(`user_${participantId}`).emit('receiveMessage', populatedMessage);
      });
    } catch (err) {
      console.error('Error saving or emitting message:', err);
      socket.emit('chatError', { msg: 'Failed to send message' });
    }
  });

  socket.on('disconnect', () => {
    const remaining = (onlineUsers.get(userId) || 1) - 1;
    if (remaining <= 0) {
      onlineUsers.delete(userId);
      socket.broadcast.emit('userOffline', userId);
    } else {
      onlineUsers.set(userId, remaining);
    }
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server started on port ${PORT}`));

// Session reminders (email + in-app) need io to push notifications
startReminderService(io);
