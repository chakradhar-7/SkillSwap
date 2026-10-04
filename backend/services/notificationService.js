const Notification = require('../models/Notification');

// Stores an in-app notification and pushes it to the user's open tabs.
// Never throws, so callers can fire and forget.
const createNotification = async (io, userId, { type, title, message, link = '/dashboard' }) => {
  if (!userId) return null;
  try {
    const notification = await Notification.create({ user: userId, type, title, message, link });
    if (io) {
      io.to(`user_${userId}`).emit('notification', notification);
    }
    return notification;
  } catch (err) {
    console.error('Failed to create notification:', err.message);
    return null;
  }
};

// Convenience for route handlers, which have io on the Express app
const notify = (req, userId, data) => createNotification(req.app.get('io'), userId, data);

module.exports = { createNotification, notify };
