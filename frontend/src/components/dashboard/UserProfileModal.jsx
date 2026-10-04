import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { X, Star, Clock, Users, GraduationCap, BookOpen, Calendar, MessageCircle, UserPlus } from 'lucide-react';
import RequestSessionModal from '../common/RequestSessionModal';
import { formatDateOnly } from '../../utils/timezone';
import { openChatWith } from '../../services/chat';

const UserProfileModal = ({ userId, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [pendingRequests, setPendingRequests] = useState({ incoming: [], outgoing: [] });
  const [showRequestModal, setShowRequestModal] = useState(false);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!userId) return;
      
      setLoading(true);
      setLoadingReviews(true);
      
      try {
        // Fetch user profile
        const profileRes = await api.get(`/profile/user/${userId}`);
        setProfile(profileRes.data);
        setLoading(false);

        // Fetch user reviews
        const reviewsRes = await api.get(`/reviews/user/${userId}`);
        setReviews(reviewsRes.data);
        setLoadingReviews(false);

        // Fetch conversations and pending requests to check connection status
        const [conversationsRes, requestsRes] = await Promise.all([
          api.get('/messages/conversations/my').catch(() => ({ data: [] })),
          api.get('/messages/requests/pending').catch(() => ({ data: { incoming: [], outgoing: [] } }))
        ]);
        setConversations(conversationsRes.data || []);
        setPendingRequests(requestsRes.data || { incoming: [], outgoing: [] });
      } catch (err) {
        console.error('Error fetching user profile:', err);
        setLoading(false);
        setLoadingReviews(false);
      }
    };

    fetchUserProfile();
  }, [userId]);

  const isConnected = (userId) => {
    return conversations.some(c => c.participant._id === userId);
  };

  const hasPendingRequest = (userId) => {
    return pendingRequests.outgoing.some(req => req.participant._id === userId);
  };

  const handleConnect = async () => {
    try {
      const { data: conversation } = await api.post(`/messages/request/${userId}`);
      if (conversation?.status === 'accepted') {
        showToast('You are now connected! You can start chatting.', 'success');
      } else {
        showToast('Connection request sent! The user will need to accept it before you can chat.', 'success', 5000);
      }
      const [conversationsRes, requestsRes] = await Promise.all([
        api.get('/messages/conversations/my').catch(() => ({ data: [] })),
        api.get('/messages/requests/pending').catch(() => ({ data: { incoming: [], outgoing: [] } })),
      ]);
      setConversations(conversationsRes.data || []);
      setPendingRequests(requestsRes.data || { incoming: [], outgoing: [] });
    } catch (err) {
      console.error('Failed to send connection request', err);
      showToast(err.response?.data?.msg || 'Could not send connection request. Please try again.', 'error');
    }
  };

  const handleStartChat = async () => {
    const conversation = conversations.find(c => c.participant._id === userId);
    if (conversation) {
      navigate(`/messages?conversation=${conversation._id}`);
      onClose();
    } else if (await openChatWith(userId, { navigate, showToast })) {
      onClose();
    }
  };

  const handleRequestSession = () => {
    setShowRequestModal(true);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (username) => {
    const colors = [
      'bg-gradient-to-br from-teal-500 to-teal-600',
      'bg-gradient-to-br from-blue-500 to-blue-600',
      'bg-gradient-to-br from-purple-500 to-purple-600',
      'bg-gradient-to-br from-pink-500 to-pink-600',
      'bg-gradient-to-br from-orange-500 to-orange-600',
      'bg-gradient-to-br from-green-500 to-green-600',
      'bg-gradient-to-br from-indigo-500 to-indigo-600',
      'bg-gradient-to-br from-red-500 to-red-600',
    ];
    if (!username) return colors[0];
    const index = username.charCodeAt(0) % colors.length;
    return colors[index];
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="text-gray-600 mt-4 text-center">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md">
          <p className="text-gray-600 text-center">Profile not found</p>
          <button
            onClick={onClose}
            className="mt-4 w-full px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const {
    username,
    skillsToTeach = [],
    skillsToLearn = [],
    availability = {},
    averageRating = 0,
    totalRatings = 0,
    hoursTaught = 0,
    hoursLearned = 0,
    peersConnected = 0,
    memberSince,
  } = profile;

  const userTimezone = profile?.availability?.timeZone || 'Not set';
  const memberSinceDate = memberSince
    ? formatDateOnly(memberSince, userTimezone, { year: 'numeric', month: 'short' })
    : 'Recently';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-500 to-teal-600 p-6 rounded-t-2xl sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-20 h-20 ${getAvatarColor(username)} rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg border-4 border-white`}>
                {getInitials(username)}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{username}</h2>
                <p className="text-teal-100 text-sm">Member since {memberSinceDate}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Connect/Request Buttons */}
              {user && user._id !== userId && (
                <div className="flex items-center gap-2">
                  {isConnected(userId) ? (
                    <button
                      onClick={handleStartChat}
                      className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg font-medium transition-all flex items-center gap-2 backdrop-blur-sm border border-white/30"
                    >
                      <MessageCircle size={18} />
                      Chat
                    </button>
                  ) : (
                    <button
                      onClick={handleConnect}
                      disabled={hasPendingRequest(userId)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                        hasPendingRequest(userId)
                          ? 'bg-white/10 text-white/50 cursor-not-allowed'
                          : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/30'
                      }`}
                    >
                      <UserPlus size={18} />
                      {hasPendingRequest(userId) ? 'Request Sent' : 'Connect'}
                    </button>
                  )}
                  <button
                    onClick={handleRequestSession}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-all flex items-center gap-2 shadow-lg hover:shadow-xl"
                  >
                    <BookOpen size={18} />
                    Request Session
                  </button>
                </div>
              )}
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 transition-colors p-2 hover:bg-white/20 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Stats Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="text-emerald-500" size={18} />
                <span className="text-xs font-semibold text-gray-700">Hours Taught</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{hoursTaught || 0}</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Users className="text-emerald-500" size={18} />
                <span className="text-xs font-semibold text-gray-700">Peers Connected</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{peersConnected || 0}</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Star className="text-amber-500 fill-amber-500" size={18} />
                <span className="text-xs font-semibold text-gray-700">Rating</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {averageRating ? averageRating.toFixed(1) : '0.0'}
              </p>
              {totalRatings > 0 && (
                <p className="text-xs text-gray-500 mt-1">({totalRatings})</p>
              )}
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="text-blue-500" size={18} />
                <span className="text-xs font-semibold text-gray-700">Hours Learned</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{hoursLearned || 0}</p>
            </div>
          </div>

          {/* Can Teach */}
          <div className="bg-emerald-50/50 rounded-xl border border-emerald-100/80 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-200 p-2 rounded-lg shadow-sm">
                <GraduationCap className="text-emerald-800" size={20} />
              </div>
              <h3 className="text-lg font-bold text-emerald-700 uppercase tracking-wide">Can Teach</h3>
              {skillsToTeach.length > 0 && (
                <span className="ml-auto px-2 py-1 bg-emerald-200 text-emerald-800 rounded-md text-xs font-bold shadow-sm">
                  {skillsToTeach.length}
                </span>
              )}
            </div>
            {skillsToTeach.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {skillsToTeach.map((skill, index) => (
                  <span
                    key={index}
                    className="px-2.5 py-1 bg-emerald-200 text-emerald-800 rounded-md text-xs font-medium shadow-sm hover:bg-emerald-300 hover:shadow transition-all"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-xs italic">No skills listed</p>
            )}
          </div>

          {/* Wants to Learn */}
          <div className="bg-blue-50/50 rounded-xl border border-blue-100/80 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-200 p-2 rounded-lg shadow-sm">
                <BookOpen className="text-blue-800" size={20} />
              </div>
              <h3 className="text-lg font-bold text-blue-700 uppercase tracking-wide">Wants to Learn</h3>
              {skillsToLearn.length > 0 && (
                <span className="ml-auto px-2 py-1 bg-blue-200 text-blue-800 rounded-md text-xs font-bold shadow-sm">
                  {skillsToLearn.length}
                </span>
              )}
            </div>
            {skillsToLearn.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {skillsToLearn.map((skill, index) => (
                  <span
                    key={index}
                    className="px-2.5 py-1 bg-blue-200 text-blue-800 rounded-md text-xs font-medium shadow-sm hover:bg-blue-300 hover:shadow transition-all"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-xs italic">No skills listed</p>
            )}
          </div>

          {/* Availability */}
          <div className="space-y-2">
            {availability.preferredDays && availability.preferredDays !== 'Not set' && (
              <div className="flex items-center gap-2 text-xs bg-stone-50/80 px-3 py-2 rounded-lg border border-stone-200/60">
                <Calendar size={12} className="text-emerald-500" />
                <span className="font-semibold text-stone-600">Preferred Days:</span>
                <span className="font-medium text-stone-500">{availability.preferredDays}</span>
              </div>
            )}
            
            {availability.format && availability.format !== 'Not set' && (
              <div className="flex items-center gap-2 text-xs bg-stone-50/80 px-3 py-2 rounded-lg border border-stone-200/60">
                <Clock size={12} className="text-emerald-500" />
                <span className="font-semibold text-stone-600">Time Slots:</span>
                <span className="font-medium text-stone-500 truncate">{availability.format}</span>
              </div>
            )}
            
            {availability.timeZone && availability.timeZone !== 'Not set' && (
              <div className="flex items-center gap-2 text-xs bg-stone-50/80 px-3 py-2 rounded-lg border border-stone-200/60">
                <Clock size={12} className="text-emerald-500" />
                <span className="font-semibold text-stone-600">Time Zone:</span>
                <span className="font-medium text-stone-500">{availability.timeZone}</span>
              </div>
            )}
            
            {(!availability.preferredDays || availability.preferredDays === 'Not set') &&
             (!availability.format || availability.format === 'Not set') &&
             (!availability.timeZone || availability.timeZone === 'Not set') && (
              <div className="text-gray-400 text-xs italic text-center py-4 bg-stone-50/50 rounded-lg border border-stone-200/60">
                Availability not set
              </div>
            )}
          </div>

          {/* Reviews Section */}
          <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-amber-100 p-2 rounded-lg">
                <Star className="text-amber-600 fill-amber-600" size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-800">Reviews</h3>
              {totalRatings > 0 && (
                <span className="ml-auto px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold">
                  {totalRatings} {totalRatings === 1 ? 'Review' : 'Reviews'}
                </span>
              )}
            </div>
            {loadingReviews ? (
              <p className="text-gray-500 text-center py-4">Loading reviews...</p>
            ) : reviews.length > 0 ? (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {reviews.map((review) => (
                  <div
                    key={review._id}
                    className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <span className="text-2xl font-bold text-gray-800">{review.rating}.0</span>
                          <div className="flex text-amber-400">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                size={16}
                                className={i < review.rating ? 'fill-amber-400' : 'text-gray-300'}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="text-sm font-medium text-gray-700">
                          by {review.reviewer?.username || review.reviewerId?.username || 'Anonymous'}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatDateOnly(review.date, userTimezone)}
                      </p>
                    </div>
                    {review.comment && (
                      <p className="text-gray-700 italic mt-2">"{review.comment}"</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No reviews yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Request Session Modal */}
      {showRequestModal && profile && (
        <RequestSessionModal
          teacher={profile}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </div>
  );
};

export default UserProfileModal;

