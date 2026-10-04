import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Check, X, Clock, MessageSquare, Calendar, BookOpen, ChevronDown } from 'lucide-react';
import { openChatWith } from '../../services/chat';
import { includesSkill } from '../../utils/matching';
import { formatCredits } from '../../utils/credits';
import {
  formatFullDateTime,
  getUtcOffsetMinutes,
  toDateTimeInputValue,
  fromDateTimeInputValue,
} from '../../utils/timezone';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EMPTY_SCHEDULE_FORM = { numberOfWeeks: 1, daysOfWeek: [], timeOfDay: '', durationHours: 1, barterSkill: '' };

const isCreditSession = (session) => session?.paymentType === 'credits';
// The teacher picks a skill to learn back only for a new barter request
// (not for credit requests, and not for the reverse half of a barter)
const needsBarterSkill = (session) => !!session && !session.barterSessionId && !isCreditSession(session);

const CreditsBadge = ({ children }) => (
  <span className="inline-flex items-center px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[11px] font-semibold">
    {children}
  </span>
);

const RequestsPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [currentSessionToSchedule, setCurrentSessionToSchedule] = useState(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [currentSessionToReschedule, setCurrentSessionToReschedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE_FORM);
  const [barterSkillSearch, setBarterSkillSearch] = useState('');
  const [showBarterSkillDropdown, setShowBarterSkillDropdown] = useState(false);
  const [learnerTeachableSkills, setLearnerTeachableSkills] = useState([]);
  const [rescheduleForm, setRescheduleForm] = useState({
    scheduledTime: '',
    durationHours: 1,
  });
  const [userProfile, setUserProfile] = useState(null);
  const [confirmedSessionFilter, setConfirmedSessionFilter] = useState('all'); // 'all', 'teaching', 'learning'

  const fetchUserProfile = async () => {
    try {
      const res = await api.get('/profile');
      setUserProfile(res.data);
    } catch (err) {
      console.error('Failed to fetch user profile', err);
    }
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/sessions');
      setSessions(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch sessions', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchSessions();
    }
  }, [user]);

  // Fetch learner's teachable skills when opening schedule modal
  useEffect(() => {
    const fetchLearnerSkills = async () => {
      if (currentSessionToSchedule && currentSessionToSchedule.learner?._id) {
        try {
          const res = await api.get(`/profile/user/${currentSessionToSchedule.learner._id}`);
          const skills = res.data.skillsToTeach || [];
          // Skills on your own learning wishlist come first
          const wishlist = user?.skillsToLearn || [];
          const sorted = [...skills].sort((a, b) =>
            (includesSkill(wishlist, b) - includesSkill(wishlist, a)) || a.localeCompare(b)
          );
          setLearnerTeachableSkills(sorted);

          // Perfect swap: pre-select a skill you want that they teach
          const wanted = sorted.find((skill) =>
            includesSkill(wishlist, skill) && skill.toLowerCase() !== currentSessionToSchedule.skill?.toLowerCase()
          );
          if (wanted && needsBarterSkill(currentSessionToSchedule)) {
            setScheduleForm(prev => (prev.barterSkill ? prev : { ...prev, barterSkill: wanted }));
            setBarterSkillSearch(prev => prev || wanted);
          }
        } catch (err) {
          console.error('Failed to fetch learner skills:', err);
          setLearnerTeachableSkills([]);
        }
      } else {
        setLearnerTeachableSkills([]);
      }
    };
    fetchLearnerSkills();
  }, [currentSessionToSchedule, user]);

  const userTimezone = userProfile?.availability?.timeZone || 'Not set';

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setCurrentSessionToSchedule(null);
    setScheduleForm(EMPTY_SCHEDULE_FORM);
    setBarterSkillSearch('');
    setShowBarterSkillDropdown(false);
  };

  // Opens the schedule modal, pre-filled from the learner's proposed time if any
  const openScheduleModal = (request) => {
    const form = { ...EMPTY_SCHEDULE_FORM };
    if (request.proposedTime) {
      const local = toDateTimeInputValue(request.proposedTime, userTimezone); // YYYY-MM-DDTHH:mm
      if (local) {
        const [datePart, timePart] = local.split('T');
        const [y, m, d] = datePart.split('-').map(Number);
        form.daysOfWeek = [DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]];
        form.timeOfDay = timePart;
      }
    }
    if (request.proposedDurationHours) {
      form.durationHours = request.proposedDurationHours;
    }
    setScheduleForm(form);
    setBarterSkillSearch('');
    setCurrentSessionToSchedule(request);
    setShowScheduleModal(true);
  };

  const handleAcceptSession = async () => {
    if (!currentSessionToSchedule) {
      showToast('No session selected.', 'warning');
      return;
    }
    
    if (!scheduleForm.numberOfWeeks || scheduleForm.daysOfWeek.length === 0 || !scheduleForm.timeOfDay || !scheduleForm.durationHours) {
      showToast('Please provide number of weeks, days of week, time, and duration.', 'warning');
      return;
    }

    // Barter system: Must select a skill to learn (only if this is NOT a reverse barter request)
    // If barterSessionId exists, it means the skill was already selected by the teacher
    const barterRequired = needsBarterSkill(currentSessionToSchedule);

    if (barterRequired && !scheduleForm.barterSkill) {
      showToast('Please select a skill you want to learn from the learner (barter system).', 'warning');
      return;
    }
    
    try {
      const response = await api.put(`/sessions/respond/${currentSessionToSchedule._id}`, {
        response: 'confirmed',
        numberOfWeeks: scheduleForm.numberOfWeeks,
        daysOfWeek: scheduleForm.daysOfWeek,
        timeOfDay: scheduleForm.timeOfDay,
        durationHours: scheduleForm.durationHours,
        // Day and time are interpreted in the teacher's timezone
        utcOffsetMinutes: getUtcOffsetMinutes(userTimezone),
        // Must exactly match one of the learner's teachable skills
        barterSkill: barterRequired ? scheduleForm.barterSkill : null,
      });

      closeScheduleModal();
      fetchSessions();
      
      if (response.data.sessions) {
        showToast(`Successfully created ${response.data.sessions.length} sessions!`, 'success');
      }
      if (response.data.barterSession) {
        showToast(response.data.barterSession.message, 'success');
      }
      if (response.data.creditsReserved > 0) {
        showToast(`${formatCredits(response.data.creditsReserved)} reserved from the learner. You'll receive them as each session is completed.`, 'success', 5000);
      }
    } catch (err) {
      console.error('Failed to accept session', err);
      showToast(err.response?.data?.msg || 'Error accepting session.', 'error');
    }
  };

  const getFilteredBarterSkills = () => {
    // Only show skills that the learner can teach
    const availableSkills = learnerTeachableSkills.filter(
      skill => skill.toLowerCase() !== currentSessionToSchedule?.skill?.toLowerCase()
    );

    if (!barterSkillSearch.trim()) {
      return availableSkills.slice(0, 15);
    }
    const query = barterSkillSearch.toLowerCase();
    return availableSkills
      .filter(skill => skill.toLowerCase().includes(query))
      .slice(0, 15);
  };

  const handleRescheduleSession = async () => {
    if (!currentSessionToReschedule || !rescheduleForm.scheduledTime) {
      showToast('Please provide a new scheduled time.', 'warning');
      return;
    }
    
    try {
      await api.put(`/sessions/reschedule/${currentSessionToReschedule._id}`, {
        scheduledTime: fromDateTimeInputValue(rescheduleForm.scheduledTime, userTimezone),
        durationHours: rescheduleForm.durationHours,
      });
      setShowRescheduleModal(false);
      setCurrentSessionToReschedule(null);
      setRescheduleForm({ scheduledTime: '', durationHours: 1 });
      fetchSessions();
      showToast('Session rescheduled successfully!', 'success');
    } catch (err) {
      console.error('Failed to reschedule session', err);
      showToast(err.response?.data?.msg || 'Error rescheduling session.', 'error');
    }
  };

  const handleDeclineSession = async (sessionId) => {
    if (window.confirm('Are you sure you want to decline this session request?')) {
      try {
        await api.put(`/sessions/respond/${sessionId}`, { response: 'cancelled' });
        fetchSessions();
      } catch (err) {
        console.error('Failed to decline session', err);
        showToast('Error declining session.', 'error');
      }
    }
  };

  const handleStartChat = (recipientId) => openChatWith(recipientId, { navigate, showToast });

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

  const formatDate = (dateString) => {
    if (!dateString) return 'Not scheduled';
    return formatFullDateTime(dateString, userTimezone);
  };

  // Filter sessions
  const incomingRequests = sessions.filter(
    (s) => s.teacher._id === user._id && s.status === 'pending'
  );
  const outgoingRequests = sessions.filter(
    (s) => s.learner._id === user._id && s.status === 'pending'
  );
  let confirmedSessions = sessions.filter(
    (s) => (s.teacher._id === user._id || s.learner._id === user._id) && s.status === 'confirmed'
  );
  
  // Apply filter to confirmed sessions
  if (confirmedSessionFilter === 'teaching') {
    confirmedSessions = confirmedSessions.filter((s) => s.teacher._id === user._id);
  } else if (confirmedSessionFilter === 'learning') {
    confirmedSessions = confirmedSessions.filter((s) => s.learner._id === user._id);
  }

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen w-screen" style={{ marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', width: '100vw' }}>
        <div className="w-full px-8 py-8">
          <div className="text-center py-12">
            <p className="text-gray-500">Loading requests...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen w-screen" style={{ marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', width: '100vw' }}>
      <div className="w-full px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Session Requests</h1>
        <p className="text-gray-500 mb-8">Manage your incoming and outgoing session requests</p>

        {/* Schedule Modal */}
        {showScheduleModal && currentSessionToSchedule && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800">
                  Schedule Sessions with {currentSessionToSchedule.learner.username}
                </h3>
                <button
                  onClick={closeScheduleModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
              {currentSessionToSchedule.proposedTime && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  Proposed by {currentSessionToSchedule.learner.username}: {formatDate(currentSessionToSchedule.proposedTime)}
                  {currentSessionToSchedule.proposedDurationHours ? ` (${currentSessionToSchedule.proposedDurationHours}h)` : ''}
                  {new Date(currentSessionToSchedule.proposedTime) > new Date() && (
                    <span className="block text-xs mt-1">
                      The form is pre-filled with this time, and sessions will start from that date.
                    </span>
                  )}
                </div>
              )}
              {/* Only show barter skill selection if this is NOT a reverse barter request */}
              {needsBarterSkill(currentSessionToSchedule) && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 font-medium flex items-center gap-2">
                    <BookOpen size={16} />
                    Barter System: Select a skill you want to learn from {currentSessionToSchedule.learner.username}
                  </p>
                  {learnerTeachableSkills.length === 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      Loading {currentSessionToSchedule.learner.username}'s teachable skills...
                    </p>
                  )}
                  {learnerTeachableSkills.length > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      {learnerTeachableSkills.length} skill{learnerTeachableSkills.length !== 1 ? 's' : ''} available to learn
                    </p>
                  )}
                  {learnerTeachableSkills.some(skill => includesSkill(user?.skillsToLearn, skill)) && (
                    <p className="text-xs text-violet-700 font-semibold mt-1">
                      Perfect swap: {currentSessionToSchedule.learner.username} teaches{' '}
                      {learnerTeachableSkills.filter(skill => includesSkill(user?.skillsToLearn, skill)).join(', ')}, from your wishlist.
                    </p>
                  )}
                </div>
              )}
              {isCreditSession(currentSessionToSchedule) && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800 font-medium">
                    {currentSessionToSchedule.learner.username} is paying with time credits - no skill needed in return.
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    This schedule costs about {formatCredits(scheduleForm.numberOfWeeks * Math.max(scheduleForm.daysOfWeek.length, 1) * scheduleForm.durationHours)}
                    {' '}({scheduleForm.numberOfWeeks} week{scheduleForm.numberOfWeeks !== 1 ? 's' : ''} x {Math.max(scheduleForm.daysOfWeek.length, 1)} day{scheduleForm.daysOfWeek.length > 1 ? 's' : ''} x {scheduleForm.durationHours}h).
                    The credits are reserved when you confirm and paid to you as each session is completed. If they can't afford it, you'll be asked to schedule less.
                  </p>
                </div>
              )}
              {/* Show info for reverse barter request */}
              {currentSessionToSchedule.barterSessionId && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-medium flex items-center gap-2">
                    <BookOpen size={16} />
                    Barter Request: You're teaching {currentSessionToSchedule.skill} to {currentSessionToSchedule.learner.username}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    The skill was already selected. Just schedule your teaching sessions below.
                  </p>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Weeks
                  </label>
                  <input
                    type="number"
                    value={scheduleForm.numberOfWeeks}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, numberOfWeeks: Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 12) }))}
                    min="1"
                    max="12"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Days of Week
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                      <label key={day} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleForm.daysOfWeek.includes(day)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setScheduleForm(prev => ({ ...prev, daysOfWeek: [...prev.daysOfWeek, day] }));
                            } else {
                              setScheduleForm(prev => ({ ...prev, daysOfWeek: prev.daysOfWeek.filter(d => d !== day) }));
                            }
                          }}
                          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-sm text-gray-700">{day}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time of Day <span className="text-xs text-gray-500">(your timezone)</span>
                  </label>
                  <input
                    type="time"
                    value={scheduleForm.timeOfDay}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, timeOfDay: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Duration (hours)
                  </label>
                  <input
                    type="number"
                    value={scheduleForm.durationHours}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, durationHours: parseFloat(e.target.value) || 1 }))}
                    min="0.5"
                    max="8"
                    step="0.5"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
                {/* Only show barter skill selection if this is NOT a reverse barter request */}
                {needsBarterSkill(currentSessionToSchedule) && (
                <div className="relative barter-skill-dropdown">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Skill to Learn from {currentSessionToSchedule.learner.username} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={scheduleForm.barterSkill || barterSkillSearch}
                      onChange={(e) => {
                        setBarterSkillSearch(e.target.value);
                        setShowBarterSkillDropdown(true);
                        // Typing clears the selection; a skill must be picked from the list
                        setScheduleForm(prev => ({ ...prev, barterSkill: '' }));
                      }}
                      onFocus={() => setShowBarterSkillDropdown(true)}
                      placeholder="Search their skills..."
                      className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                    <ChevronDown 
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                      size={20}
                    />
                    {showBarterSkillDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {getFilteredBarterSkills().map((skill) => (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => {
                              setScheduleForm(prev => ({ ...prev, barterSkill: skill }));
                              setBarterSkillSearch(skill);
                              setShowBarterSkillDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-teal-50 transition-colors ${
                              scheduleForm.barterSkill === skill ? 'bg-teal-100 font-medium' : ''
                            }`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span>{skill}</span>
                              {includesSkill(user?.skillsToLearn, skill) && (
                                <span className="text-[11px] font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                                  On your wishlist
                                </span>
                              )}
                            </span>
                          </button>
                        ))}
                        {getFilteredBarterSkills().length === 0 && barterSkillSearch.trim() && (
                          <div className="px-4 py-2 text-gray-500 text-sm">
                            No matching skills found. {currentSessionToSchedule.learner.username} can teach: {learnerTeachableSkills.join(', ')}
                          </div>
                        )}
                        {learnerTeachableSkills.length === 0 && (
                          <div className="px-4 py-2 text-gray-500 text-sm">
                            {currentSessionToSchedule.learner.username} hasn't added any skills they can teach yet.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {scheduleForm.barterSkill && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm text-gray-600">Selected:</span>
                      <span className="px-3 py-1 bg-teal-100 text-teal-800 rounded-full text-sm font-medium">
                        {scheduleForm.barterSkill}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setScheduleForm(prev => ({ ...prev, barterSkill: '' }));
                          setBarterSkillSearch('');
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>
                )}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeScheduleModal}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAcceptSession}
                    className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                  >
                    {isCreditSession(currentSessionToSchedule) ? 'Confirm & reserve credits' : 'Confirm Schedule'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reschedule Modal */}
        {showRescheduleModal && currentSessionToReschedule && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800">
                  Reschedule Session
                </h3>
                <button
                  onClick={() => {
                    setShowRescheduleModal(false);
                    setCurrentSessionToReschedule(null);
                    setRescheduleForm({ scheduledTime: '', durationHours: 1 });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-gray-600 mb-2">
                  Please enter a new date and time for this session:
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Scheduled Time
                  </label>
                  <input
                    type="datetime-local"
                    value={rescheduleForm.scheduledTime}
                    onChange={(e) => setRescheduleForm(prev => ({ ...prev, scheduledTime: e.target.value }))}
                    min={toDateTimeInputValue(new Date(), userTimezone)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Duration (hours)
                  </label>
                  <input
                    type="number"
                    value={rescheduleForm.durationHours}
                    onChange={(e) => setRescheduleForm(prev => ({ ...prev, durationHours: parseFloat(e.target.value) || 1 }))}
                    min="0.5"
                    max="8"
                    step="0.5"
                    disabled={isCreditSession(currentSessionToReschedule)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                    required
                  />
                  {isCreditSession(currentSessionToReschedule) && (
                    <p className="text-xs text-gray-500 mt-1">
                      The length of a credit session is fixed because its credits are already reserved.
                    </p>
                  )}
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRescheduleModal(false);
                      setCurrentSessionToReschedule(null);
                      setRescheduleForm({ scheduledTime: '', durationHours: 1 });
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRescheduleSession}
                    className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                  >
                    Reschedule
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Incoming and Outgoing Requests - Side by Side */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Session Requests</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Incoming Requests */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Incoming Requests</h3>
                {incomingRequests.length > 0 && (
                  <span className="bg-orange-500 text-white text-xs font-bold rounded-full px-3 py-1">
                    {incomingRequests.length}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto max-h-96 border border-gray-200 rounded-lg p-4">
                {incomingRequests.length > 0 ? (
                  <div className="space-y-4">
                    {incomingRequests.map((request) => (
                      <div
                        key={request._id}
                        className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`w-10 h-10 ${getAvatarColor(request.learner.username)} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
                          >
                            {getInitials(request.learner.username)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 text-sm truncate">
                              <span className="text-teal-600">{request.learner.username}</span> wants to learn{' '}
                              <span className="font-bold">{request.skill}</span>
                            </p>
                            {isCreditSession(request) && <CreditsBadge>Pays with credits</CreditsBadge>}
                            <p className="text-xs text-gray-500">
                              Requested {formatDate(request.requestedDate)}
                            </p>
                            {request.proposedTime && (
                              <p className="text-xs text-yellow-700">
                                Proposed time: {formatDate(request.proposedTime)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleStartChat(request.learner._id)}
                            className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                            title="Chat with user"
                          >
                            <MessageSquare size={18} />
                          </button>
                          <button
                            onClick={() => openScheduleModal(request)}
                            className="p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
                            title="Accept Request"
                          >
                            <Check size={18} />
                          </button>
                          <button
                            onClick={() => handleDeclineSession(request._id)}
                            className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                            title="Decline Request"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No incoming requests</p>
                )}
              </div>
            </div>

            {/* Outgoing Requests */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Outgoing Requests</h3>
                {outgoingRequests.length > 0 && (
                  <span className="bg-blue-500 text-white text-xs font-bold rounded-full px-3 py-1">
                    {outgoingRequests.length}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto max-h-96 border border-gray-200 rounded-lg p-4">
                {outgoingRequests.length > 0 ? (
                  <div className="space-y-4">
                    {outgoingRequests.map((request) => (
                      <div
                        key={request._id}
                        className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`w-10 h-10 ${getAvatarColor(request.teacher.username)} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
                          >
                            {getInitials(request.teacher.username)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 text-sm truncate">
                              You requested to learn <span className="font-bold">{request.skill}</span> from{' '}
                              <span className="text-teal-600">{request.teacher.username}</span>
                            </p>
                            {isCreditSession(request) && <CreditsBadge>Paying with credits</CreditsBadge>}
                            <p className="text-xs text-gray-500">
                              Requested {formatDate(request.requestedDate)}
                            </p>
                            {request.proposedTime && (
                              <p className="text-xs text-yellow-700">
                                Proposed time: {formatDate(request.proposedTime)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium flex items-center gap-1">
                            <Clock size={12} />
                            Pending
                          </span>
                          <button
                            onClick={() => handleStartChat(request.teacher._id)}
                            className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                            title="Chat with teacher"
                          >
                            <MessageSquare size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No outgoing requests</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Confirmed Sessions */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Confirmed Sessions</h2>
            <div className="flex items-center gap-4">
              {confirmedSessions.length > 0 && (
                <span className="bg-green-500 text-white text-xs font-bold rounded-full px-3 py-1">
                  {confirmedSessions.length}
                </span>
              )}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Filter:</label>
                <select
                  value={confirmedSessionFilter}
                  onChange={(e) => setConfirmedSessionFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  <option value="all">All Sessions</option>
                  <option value="teaching">Teaching</option>
                  <option value="learning">Learning</option>
                </select>
              </div>
            </div>
          </div>
          {confirmedSessions.length > 0 ? (
            <div className="space-y-4">
              {confirmedSessions.map((session) => {
                const otherUser = session.teacher._id === user._id ? session.learner : session.teacher;
                const isTeacher = session.teacher._id === user._id;
                return (
                  <div
                    key={session._id}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div
                        className={`w-12 h-12 ${getAvatarColor(otherUser.username)} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
                      >
                        {getInitials(otherUser.username)}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">
                          <span className="font-bold">{session.skill}</span> with{' '}
                          <span className="text-teal-600">{otherUser.username}</span>
                        </p>
                        <p className="text-sm text-gray-500">
                          <Calendar size={14} className="inline mr-1" />
                          {formatDate(session.scheduledTime)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {isTeacher ? 'You are teaching' : 'You are learning'} • Duration: {session.durationHours} hour{session.durationHours !== 1 ? 's' : ''}
                          {isCreditSession(session) && session.creditsHeld > 0 && (
                            <> • {formatCredits(session.creditsHeld)} {isTeacher ? 'paid to you on completion' : 'reserved'}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        Confirmed
                      </span>
                      <button
                        onClick={() => {
                          setCurrentSessionToReschedule(session);
                          setRescheduleForm({
                            scheduledTime: toDateTimeInputValue(session.scheduledTime, userTimezone),
                            durationHours: session.durationHours || 1,
                          });
                          setShowRescheduleModal(true);
                        }}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={async () => {
                          const refundNote = isCreditSession(session) && session.creditsHeld > 0
                            ? `\n\n${formatCredits(session.creditsHeld)} will be refunded to ${isTeacher ? 'the learner' : 'you'}.`
                            : '';
                          if (window.confirm(`Are you sure you want to cancel this session?${refundNote}`)) {
                            try {
                              await api.put(`/sessions/cancel/${session._id}`);
                              fetchSessions();
                              showToast('Session cancelled successfully!', 'success');
                            } catch (err) {
                              console.error('Failed to cancel session', err);
                              showToast(err.response?.data?.msg || 'Failed to cancel session', 'error');
                            }
                          }
                        }}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                      {session.meetingLink && (
                        <a
                          href={isTeacher && session.startUrl ? session.startUrl : session.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors text-sm font-medium"
                        >
                          {isTeacher ? 'Start' : 'Join'} Meeting
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No confirmed sessions</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestsPage;

