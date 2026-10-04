import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { LayoutDashboard, User, LogOut, UserPlus, Users, MessageSquare, CalendarCheck } from 'lucide-react';
import NotificationBell from './NotificationBell';
import CreditsBadge from './CreditsBadge';
import { useSocket } from '../../context/SocketContext';

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [pendingChatRequestsCount, setPendingChatRequestsCount] = useState(0);

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  // Fetch pending requests count
  useEffect(() => {
    if (isAuthenticated && user) {
      const fetchPendingCount = async () => {
        try {
          const [sessionsRes, chatRequestsRes] = await Promise.all([
            api.get('/sessions'),
            api.get('/messages/requests/pending').catch(() => ({ data: { incoming: [] } }))
          ]);
          const incomingRequests = sessionsRes.data.filter(
            (s) => s.teacher._id === user._id && s.status === 'pending'
          );
          setPendingRequestsCount(incomingRequests.length);
          setPendingChatRequestsCount(chatRequestsRes.data.incoming?.length || 0);
        } catch (err) {
          console.error('Failed to fetch pending requests', err);
        }
      };
      fetchPendingCount();
      // Refresh every 30 seconds
      const interval = setInterval(fetchPendingCount, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user]);

  // Listen for socket events to update chat request count in real-time
  useEffect(() => {
    if (!socket || !isAuthenticated) return;

    const handleNewChatRequest = () => {
      const fetchChatRequests = async () => {
        try {
          const res = await api.get('/messages/requests/pending').catch(() => ({ data: { incoming: [] } }));
          setPendingChatRequestsCount(res.data.incoming?.length || 0);
        } catch (err) {
          console.error('Failed to fetch chat requests', err);
        }
      };
      fetchChatRequests();
    };

    const handleChatRequestAccepted = () => {
      handleNewChatRequest();
    };

    const handleConversationUpdate = () => {
      handleNewChatRequest();
    };

    socket.on('newChatRequest', handleNewChatRequest);
    socket.on('chatRequestAccepted', handleChatRequestAccepted);
    socket.on('conversationUpdate', handleConversationUpdate);

    return () => {
      socket.off('newChatRequest', handleNewChatRequest);
      socket.off('chatRequestAccepted', handleChatRequestAccepted);
      socket.off('conversationUpdate', handleConversationUpdate);
    };
  }, [socket, isAuthenticated]);

  const authLinks = (
    <div className="flex items-center gap-4">
      <Link 
        to="/dashboard" 
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
          isActive('/dashboard') 
            ? 'bg-teal-50 text-teal-700 font-medium' 
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
      >
        <LayoutDashboard size={20} />
        <span>Dashboard</span>
      </Link>
      <Link 
        to="/browse" 
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
          isActive('/browse') 
            ? 'bg-teal-50 text-teal-700 font-medium' 
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
      >
        <Users size={20} />
        <span>Learn</span>
      </Link>
      <Link 
        to="/messages" 
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all relative ${
          isActive('/messages') 
            ? 'bg-teal-50 text-teal-700 font-medium' 
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
      >
        <MessageSquare size={20} />
        <span>Chat</span>
        {pendingChatRequestsCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
            {pendingChatRequestsCount > 9 ? '9+' : pendingChatRequestsCount}
          </span>
        )}
      </Link>
      <Link 
        to="/requests" 
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all relative ${
          isActive('/requests') 
            ? 'bg-teal-50 text-teal-700 font-medium' 
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
      >
        <CalendarCheck size={20} />
        <span>Requests</span>
        {pendingRequestsCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
            {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
          </span>
        )}
      </Link>
      <CreditsBadge />
      <NotificationBell />
      <Link 
        to="/profile" 
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
          isActive('/profile') 
            ? 'bg-teal-50 text-teal-700 font-medium' 
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
      >
        <User size={20} />
        <span>Profile</span>
      </Link>
      <button 
        onClick={onLogout} 
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-all"
      >
        <LogOut size={20} />
        <span>Logout</span>
      </button>
    </div>
  );

  const guestLinks = (
    <div className="flex items-center gap-4">
      <Link 
        to="/login" 
        className="px-4 py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all"
      >
        Login
      </Link>
      <Link 
        to="/register" 
        className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-teal-600 text-white px-4 py-2 rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all shadow-sm"
      >
        <UserPlus size={20} />
        <span>Register</span>
      </Link>
    </div>
  );

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 w-full sticky top-0 z-50">
      <div className="w-full px-8">
        <div className="flex justify-between items-center h-16">
          <Link to={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img 
              src="/logo.png" 
              alt="SkillSwap Logo" 
              className="h-12 w-12 object-contain"
            />
            <span className="text-2xl font-bold text-gray-800">SkillSwap</span>
          </Link>
          <div>
            {isAuthenticated ? authLinks : guestLinks}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;