import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { formatRelativeTime } from '../../utils/timezone';

const NotificationBell = () => {
  const { user } = useAuth();
  const socket = useSocket();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const timeZone = user?.availability?.timeZone;

  useEffect(() => {
    api.get('/notifications')
      .then((res) => {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      })
      .catch((err) => console.error('Failed to load notifications', err));
  }, []);

  // New notifications arrive in real time
  useEffect(() => {
    if (!socket) return undefined;
    const handleNotification = (notification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 30));
      setUnreadCount((count) => count + 1);
      showToast(`${notification.title}: ${notification.message}`, 'info', 5000);
    };
    socket.on('notification', handleNotification);
    return () => socket.off('notification', handleNotification);
  }, [socket, showToast]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const openNotification = async (notification) => {
    setOpen(false);
    if (!notification.read) {
      setNotifications((prev) => prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n)));
      setUnreadCount((count) => Math.max(count - 1, 0));
      api.put(`/notifications/${notification._id}/read`).catch(() => {});
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api.put('/notifications/read-all');
    } catch (err) {
      console.error('Failed to mark notifications as read', err);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all"
        title="Notifications"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700">
                <CheckCheck size={14} />
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">You're all caught up.</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification._id}
                  onClick={() => openNotification(notification)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-3 ${
                    notification.read ? '' : 'bg-teal-50/50'
                  }`}
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${notification.read ? 'bg-transparent' : 'bg-teal-500'}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-800">{notification.title}</span>
                    <span className="block text-sm text-gray-600">{notification.message}</span>
                    <span className="block text-xs text-gray-400 mt-1">{formatRelativeTime(notification.createdAt, timeZone)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
