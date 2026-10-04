import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import { Video, Calendar, Send, Bell, Search, Check, XCircle, Flag } from 'lucide-react';
import {
  formatRelativeTime,
  formatMessageTime as formatMessageTimeTZ,
  formatFullDateTime,
} from '../../utils/timezone';
import RequestSessionModal from '../common/RequestSessionModal';

// Render http(s) links in chat messages as clickable links (text stays escaped by React)
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const renderMessageContent = (text = '') =>
  text.split(URL_PATTERN).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all">
        {part}
      </a>
    ) : (
      part
    )
  );

const ChatPage = () => {
  const { user } = useAuth();
  const socket = useSocket();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [pendingRequests, setPendingRequests] = useState({ incoming: [], outgoing: [] });
  const [showRequests, setShowRequests] = useState(false);
  const [searchUsers, setSearchUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportForm, setReportForm] = useState({
    reason: '',
    description: '',
  });
  const [userProfile, setUserProfile] = useState(null);
  const conversationsRef = useRef([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Fetch user profile to get timezone
  const fetchUserProfile = async () => {
    try {
      const res = await api.get('/profile');
      setUserProfile(res.data);
    } catch (err) {
      console.error('Failed to fetch user profile', err);
    }
  };

  // Fetch conversations
  const fetchConversations = async () => {
    try {
      const res = await api.get('/messages/conversations/my');
      setConversations(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch conversations', err);
      setLoading(false);
    }
  };

  // Fetch pending chat requests
  const fetchPendingRequests = async () => {
    try {
      setLoadingRequests(true);
      const res = await api.get('/messages/requests/pending').catch(() => ({ data: { incoming: [], outgoing: [] } }));
      setPendingRequests(res.data || { incoming: [], outgoing: [] });
      setLoadingRequests(false);
    } catch (err) {
      console.error('Failed to fetch pending requests', err);
      setLoadingRequests(false);
    }
  };

  // Search users for chat
  const searchUsersForChat = async (term) => {
    if (!term.trim()) {
      setSearchUsers([]);
      return;
    }
    try {
      const res = await api.get('/profile/all');
      const filtered = res.data
        .filter(u => u._id !== user?._id)
        .filter(u => {
          const username = (u.username || '').toLowerCase();
          return username.includes(term.toLowerCase());
        })
        .slice(0, 5);
      setSearchUsers(filtered);
    } catch (err) {
      console.error('Failed to search users', err);
    }
  };

  // Handle sending chat request
  const handleSendChatRequest = async (recipientId) => {
    try {
      await api.post(`/messages/request/${recipientId}`);
      fetchPendingRequests();
      fetchConversations();
      setSearchTerm('');
      setSearchUsers([]);
      showToast('Chat request sent', 'success');
    } catch (err) {
      console.error('Failed to send chat request', err);
      showToast(err.response?.data?.msg || 'Failed to send chat request', 'error');
    }
  };

  // Handle accepting chat request
  const handleAcceptRequest = async (conversationId) => {
    try {
      await api.post(`/messages/requests/${conversationId}/accept`);
      fetchPendingRequests();
      fetchConversations();
    } catch (err) {
      console.error('Failed to accept request', err);
      showToast(err.response?.data?.msg || 'Failed to accept request', 'error');
    }
  };

  // Handle rejecting chat request
  const handleRejectRequest = async (conversationId) => {
    try {
      await api.post(`/messages/requests/${conversationId}/reject`);
      fetchPendingRequests();
    } catch (err) {
      console.error('Failed to reject request', err);
      showToast(err.response?.data?.msg || 'Failed to reject request', 'error');
    }
  };

  // Fetch messages for selected conversation
  const fetchMessages = async (conversationId) => {
    try {
      const res = await api.get(`/messages/${conversationId}`);
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to fetch messages', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchConversations();
      fetchPendingRequests();
    }
  }, [user]);

  // Listen for chat request events
  useEffect(() => {
    if (!socket || !user) return;

    const handleNewChatRequest = () => {
      fetchPendingRequests();
    };

    const handleChatRequestAccepted = () => {
      fetchPendingRequests();
      fetchConversations();
    };

    const handleConversationUpdate = () => {
      fetchPendingRequests();
      fetchConversations();
    };

    const handleChatError = (data) => {
      console.error('Chat error:', data);
      showToast(data?.msg || 'Message could not be sent', 'error', 5000);
      setMessages((prev) => prev.filter((m) => !m.isOptimistic));
    };

    socket.on('newChatRequest', handleNewChatRequest);
    socket.on('chatRequestAccepted', handleChatRequestAccepted);
    socket.on('conversationUpdate', handleConversationUpdate);
    socket.on('chatError', handleChatError);

    return () => {
      socket.off('newChatRequest', handleNewChatRequest);
      socket.off('chatRequestAccepted', handleChatRequestAccepted);
      socket.off('conversationUpdate', handleConversationUpdate);
      socket.off('chatError', handleChatError);
    };
  }, [socket, user]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm) {
        searchUsersForChat(searchTerm);
      } else {
        setSearchUsers([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Auto-refresh pending requests
  useEffect(() => {
    const interval = setInterval(fetchPendingRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  // Handle conversation from URL parameter
  const refetchedForParam = useRef(null);
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (!conversationId || loading) return;

    const conversation = conversations.find(c => c._id === conversationId);
    if (conversation) {
      setSelectedConversation(conversation);
      setSearchParams({});
      return;
    }

    if (refetchedForParam.current === conversationId) {
      // Already refetched once and it is still not an accepted chat
      refetchedForParam.current = null;
      setSearchParams({});
      showToast('That chat is not available yet. The request may still be pending.', 'warning');
      return;
    }

    // Newly accepted conversations may not be in the list yet - refetch once
    refetchedForParam.current = conversationId;
    fetchConversations();
  }, [conversations, searchParams, setSearchParams, loading]);

  // Socket connection and room joining
  useEffect(() => {
    if (!socket || !user) return;

    // Messages for all of this user's conversations arrive in their personal room
    const handleReceiveMessage = (message) => {
      // Move the conversation to the top with the new last message
      if (conversationsRef.current.some((c) => c._id === message.conversationId)) {
        setConversations((prev) => {
          const target = prev.find((c) => c._id === message.conversationId);
          if (!target) return prev;
          return [
            { ...target, lastMessage: message, updatedAt: message.createdAt },
            ...prev.filter((c) => c._id !== message.conversationId),
          ];
        });
      } else {
        fetchConversations();
      }

      if (message.conversationId === selectedConversation?._id) {
        // Message is for current conversation
        setMessages((prev) => {
          // Check if this is a replacement for an optimistic message
          if (message.sender._id === user._id) {
            // This is my message - replace optimistic version
            const optimisticIndex = prev.findIndex(
              m => m.isOptimistic && m.sender._id === user._id && m.content === message.content
            );
            if (optimisticIndex > -1) {
              const newMessages = [...prev];
              newMessages[optimisticIndex] = message;
              return newMessages;
            }
          }
          // Check if message already exists
          if (!prev.find(m => m._id === message._id)) {
            return [...prev, message];
          }
          return prev;
        });
      } else {
        // Message is for another conversation - update unread count
        if (message.sender._id !== user._id) {
          setUnreadCounts((prev) => ({
            ...prev,
            [message.conversationId]: (prev[message.conversationId] || 0) + 1,
          }));
        }
      }
    };

    // Listen for online status updates
    const handleUserOnline = (userId) => {
      setOnlineUsers((prev) => new Set([...prev, userId]));
    };

    const handleOnlineUsers = (userIds) => {
      setOnlineUsers(new Set(userIds));
    };

    const handleUserOffline = (userId) => {
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    };

    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('userOnline', handleUserOnline);
    socket.on('userOffline', handleUserOffline);
    socket.on('onlineUsers', handleOnlineUsers);

    return () => {
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('userOnline', handleUserOnline);
      socket.off('userOffline', handleUserOffline);
      socket.off('onlineUsers', handleOnlineUsers);
    };
  }, [socket, user, selectedConversation]);

  // Load messages when a conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation._id);
      // Clear unread count for this conversation
      setUnreadCounts((prev) => {
        const newCounts = { ...prev };
        delete newCounts[selectedConversation._id];
        return newCounts;
      });
    }
  }, [selectedConversation]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input when conversation is selected
  useEffect(() => {
    if (selectedConversation && messageInputRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
    }
  }, [selectedConversation]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket || !selectedConversation) return;

    const optimisticMessage = {
      _id: `temp-${Date.now()}`,
      sender: { _id: user._id, username: user.username },
      content: newMessage,
      createdAt: new Date().toISOString(),
      isOptimistic: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    
    socket.emit('sendMessage', {
      conversationId: selectedConversation._id,
      content: newMessage,
    });

    setNewMessage('');
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (name) => {
    const colors = ['bg-orange-500', 'bg-red-500', 'bg-blue-500', 'bg-purple-500', 'bg-teal-500'];
    const index = name ? name.charCodeAt(0) % colors.length : 0;
    return colors[index];
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const userTimezone = userProfile?.availability?.timeZone || 'Not set';
    return formatRelativeTime(dateString, userTimezone);
  };

  const formatMessageTime = (dateString) => {
    if (!dateString) return '';
    const userTimezone = userProfile?.availability?.timeZone || 'Not set';
    return formatMessageTimeTZ(dateString, userTimezone);
  };

  const [showBookModal, setShowBookModal] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  const handleStartSession = async () => {
    if (!selectedConversation) return;
    
    const teacherId = selectedConversation.participant._id;
    
    setLoadingSession(true);
    try {
      // Get the other person's profile to see what they can teach
      const teacherProfileRes = await api.get(`/profile/all`);
      const teacherProfile = teacherProfileRes.data.find(p => p._id === teacherId);
      const teacherSkills = teacherProfile?.skillsToTeach || [];
      
      // Get user's skills to learn to find a match
      const userProfileRes = await api.get('/profile');
      const userSkillsToLearn = userProfileRes.data.skillsToLearn || [];
      
      // Find a matching skill (skill user wants to learn that teacher can teach)
      const matchingSkill = userSkillsToLearn.find(skill => 
        teacherSkills.some(ts => ts.toLowerCase() === skill.toLowerCase())
      ) || teacherSkills[0] || userSkillsToLearn[0] || 'General Session';
      
      // Create instant session
      const res = await api.post('/sessions/instant', {
        teacherId,
        skill: matchingSkill,
      });
      
      // Open the Zoom meeting in a new tab
      if (res.data.meetingLink) {
        window.open(res.data.meetingLink, '_blank', 'noopener,noreferrer');
      }

      // Share the join link in the chat
      if (socket && selectedConversation && res.data.meetingLink) {
        socket.emit('sendMessage', {
          conversationId: selectedConversation._id,
          content: `Started an instant session on ${matchingSkill}. Join here: ${res.data.meetingLink}`,
        });
      }
    } catch (err) {
      console.error('Failed to start session', err);
      showToast(err.response?.data?.msg || 'Failed to start session. Please try again.', 'error');
    } finally {
      setLoadingSession(false);
    }
  };

  const handleBookSession = () => {
    if (selectedConversation) setShowBookModal(true);
  };

  // After a request is sent from the booking modal, mention it in the chat
  const handleBookingSent = ({ skill, proposedTime, durationHours }) => {
    if (!socket || !selectedConversation) return;
    const userTimezone = userProfile?.availability?.timeZone || 'Not set';
    const length = durationHours < 1 ? '30 minutes' : `${durationHours} hour${durationHours > 1 ? 's' : ''}`;
    const when = proposedTime ? ` for ${formatFullDateTime(proposedTime, userTimezone)}` : '';
    socket.emit('sendMessage', {
      conversationId: selectedConversation._id,
      content: `I requested a ${skill} session${when} (${length}). Please check your Requests page.`,
    });
  };

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!reportForm.reason || !reportForm.description.trim()) {
      showToast('Please fill in all fields', 'warning');
      return;
    }
    if (!selectedConversation) {
      showToast('No conversation selected', 'warning');
      return;
    }
    try {
      await api.post('/messages/report', {
        reportedUserId: selectedConversation.participant._id,
        conversationId: selectedConversation._id,
        reason: reportForm.reason,
        description: reportForm.description,
      });
      showToast('Report submitted successfully. Our team will review it.', 'success');
      setShowReportModal(false);
      setReportForm({ reason: '', description: '' });
    } catch (err) {
      console.error('Error submitting report:', err);
      showToast(err.response?.data?.msg || 'Failed to submit report', 'error');
    }
  };

  return (
    <div className="flex bg-gray-50 overflow-hidden" style={{ position: 'fixed', top: '64px', left: 0, right: 0, bottom: 0, height: 'calc(100vh - 64px)', width: '100vw', margin: 0 }}>
      {/* Left Sidebar - Conversations List */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-800">Messages</h2>
            <button
              onClick={() => setShowRequests(!showRequests)}
              className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="Chat Requests"
            >
              <Bell size={20} className="text-gray-600" />
              {pendingRequests.incoming.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingRequests.incoming.length > 9 ? '9+' : pendingRequests.incoming.length}
                </span>
              )}
            </button>
          </div>
          
          {/* Search/Add User Section */}
          <div className="relative mb-3">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              placeholder="Search users..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchUsers.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchUsers.map((searchUser) => {
                  const isAlreadyConnected = conversations.some(c => c.participant._id === searchUser._id);
                  const hasPendingOutgoing = pendingRequests.outgoing.some(req => req.participant._id === searchUser._id);
                  
                  return (
                    <div
                      key={searchUser._id}
                      className="p-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 ${getAvatarColor(searchUser.username)} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
                          {getInitials(searchUser.username)}
                        </div>
                        <span className="text-sm font-medium text-gray-800">{searchUser.username}</span>
                      </div>
                      {isAlreadyConnected ? (
                        <span className="text-xs text-gray-500">Connected</span>
                      ) : hasPendingOutgoing ? (
                        <span className="text-xs text-gray-500">Request Sent</span>
                      ) : (
                        <button
                          onClick={() => handleSendChatRequest(searchUser._id)}
                          className="text-xs bg-teal-500 text-white px-2 py-1 rounded hover:bg-teal-600 transition-colors"
                        >
                          Request
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chat Requests Panel */}
          {showRequests && (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-60 overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Chat Requests</h3>
              
              {/* Incoming Requests */}
              {pendingRequests.incoming.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-600 mb-1">Incoming ({pendingRequests.incoming.length})</p>
                  {pendingRequests.incoming.map((req) => (
                    <div key={req._id} className="p-2 bg-white rounded mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-800 truncate flex-1">
                        {req.participant?.username || 'Unknown'}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleAcceptRequest(req._id)}
                          className="p-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                          title="Accept"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => handleRejectRequest(req._id)}
                          className="p-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                          title="Reject"
                        >
                          <XCircle size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Outgoing Requests */}
              {pendingRequests.outgoing.length > 0 && (
                <div>
                  <p className="text-xs text-gray-600 mb-1">Outgoing ({pendingRequests.outgoing.length})</p>
                  {pendingRequests.outgoing.map((req) => (
                    <div key={req._id} className="p-2 bg-white rounded mb-2">
                      <span className="text-xs text-gray-600">
                        {req.participant?.username || 'Unknown'} - Pending
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {pendingRequests.incoming.length === 0 && pendingRequests.outgoing.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">No pending requests</p>
              )}
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No conversations yet</div>
          ) : (
            conversations.map((convo) => {
              const isSelected = selectedConversation?._id === convo._id;
              const unreadCount = unreadCounts[convo._id] || 0;
              const isOnline = onlineUsers.has(convo.participant._id);

              return (
                <div
                  key={convo._id}
                  onClick={() => setSelectedConversation(convo)}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <div
                        className={`w-12 h-12 ${getAvatarColor(convo.participant.username)} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
                      >
                        {getInitials(convo.participant.username)}
                      </div>
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-gray-800 truncate">
                          {convo.participant.username}
                        </h3>
                        {convo.lastMessage && (
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                            {formatTime(convo.lastMessage.createdAt || convo.updatedAt)}
                          </span>
                        )}
                      </div>
                      {convo.lastMessage && (
                        <p className="text-sm text-gray-600 truncate">
                          {convo.lastMessage.content}
                        </p>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <div className="flex-shrink-0">
                        <span className="bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {unreadCount}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ height: 'calc(100vh - 64px)' }}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div
                    className={`w-10 h-10 ${getAvatarColor(selectedConversation.participant.username)} rounded-full flex items-center justify-center text-white font-bold`}
                  >
                    {getInitials(selectedConversation.participant.username)}
                  </div>
                  {onlineUsers.has(selectedConversation.participant._id) && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">
                    {selectedConversation.participant.username}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {onlineUsers.has(selectedConversation.participant._id) ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowReportModal(true)}
                  className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Report user"
                >
                  <Flag size={18} />
                </button>
                <button
                  onClick={handleStartSession}
                  disabled={loadingSession}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Video size={18} />
                  <span>{loadingSession ? 'Starting...' : 'Start Session'}</span>
                </button>
                <button
                  onClick={handleBookSession}
                  disabled={loadingSession}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Calendar size={18} />
                  <span>Book Session</span>
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 min-h-0">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">No messages yet. Start the conversation!</div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => {
                    const isOwn = msg.sender._id === user._id;
                    return (
                      <div
                        key={msg._id || `temp-${msg.createdAt}`}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex items-start gap-2 max-w-[70%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          {!isOwn && (
                            <div className={`w-8 h-8 ${getAvatarColor(msg.sender.username)} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                              {getInitials(msg.sender.username)}
                            </div>
                          )}
                          <div 
                            className={`rounded-2xl px-4 py-2 ${msg.isOptimistic ? 'opacity-70' : ''}`}
                            style={{
                              backgroundColor: isOwn ? 'hsl(28, 85%, 70%)' : 'hsl(174, 62%, 65%)',
                              color: '#1F2937'
                            }}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{renderMessageContent(msg.content)}</p>
                            <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
                              {formatMessageTime(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="bg-white border-t border-gray-200 p-4 flex-shrink-0">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input
                  ref={messageInputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  maxLength={2000}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  autoFocus
                />
                <button
                  type="submit"
                  className="bg-gradient-to-r from-teal-500 to-blue-500 text-white p-3 rounded-full hover:from-teal-600 hover:to-blue-600 transition-colors flex-shrink-0"
                >
                  <Send size={20} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-500">
              <p className="text-lg mb-2">Select a conversation to start chatting</p>
              <p className="text-sm">Choose a conversation from the sidebar</p>
            </div>
          </div>
        )}
      </div>

      {/* Book Session Modal */}
      {showBookModal && selectedConversation && (
        <RequestSessionModal
          teacher={selectedConversation.participant}
          onClose={() => setShowBookModal(false)}
          onSent={handleBookingSent}
        />
      )}

      {/* Report Modal */}
      {showReportModal && selectedConversation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Report User</h2>
            <form onSubmit={handleSubmitReport}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason
                </label>
                <select
                  value={reportForm.reason}
                  onChange={(e) => setReportForm({ ...reportForm, reason: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  <option value="">Select a reason</option>
                  <option value="harassment">Harassment</option>
                  <option value="spam">Spam</option>
                  <option value="inappropriate_content">Inappropriate Content</option>
                  <option value="scam">Scam</option>
                  <option value="fake_profile">Fake Profile</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={reportForm.description}
                  onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
                  rows="4"
                  className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Please provide details about the issue..."
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700"
                >
                  Submit Report
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowReportModal(false);
                    setReportForm({ reason: '', description: '' });
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;

