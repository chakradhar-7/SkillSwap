import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Plus, X, Calendar, CheckCircle, Award, BookOpen, FileText, MessageSquare } from 'lucide-react';
import { predefinedSkills, normalizeSkillName, getAllUserSkills } from '../../utils/skills';
import { formatDateOnly, timezoneOptions as allTimezoneOptions } from '../../utils/timezone';
import TimeSlotManager from '../common/TimeSlotManager';

const ProfileStat = ({ value, label }) => (
  <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
    <p className="text-4xl font-bold text-gray-800 mb-2">{value}</p>
    <p className="text-sm font-medium text-gray-600 text-center">{label}</p>
  </div>
);

const SkillPill = ({ skill, onRemove, color }) => (
  <span className={`${color} text-white px-4 py-2 rounded-full font-medium flex items-center gap-2`}>
    {skill}
    {onRemove && (
      <button 
        onClick={onRemove} 
        className="text-white hover:text-gray-200 transition-colors"
        title="Remove skill"
      >
        <X size={16} />
      </button>
    )}
  </span>
);

const Profile = () => {
  const { user, loadUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  // Skill Management States
  const [newSkillToTeach, setNewSkillToTeach] = useState('');
  const [newSkillToLearn, setNewSkillToLearn] = useState('');
  const [showAddSkillTeach, setShowAddSkillTeach] = useState(false);
  const [showAddSkillLearn, setShowAddSkillLearn] = useState(false);
  const [skillSearchTeach, setSkillSearchTeach] = useState('');
  const [skillSearchLearn, setSkillSearchLearn] = useState('');
  const [allAvailableSkills, setAllAvailableSkills] = useState(predefinedSkills);

  // Availability Management States
  const [editingAvailability, setEditingAvailability] = useState(false);
  const [preferredDays, setPreferredDays] = useState('Not set');
  const [timeZone, setTimeZone] = useState('Not set');
  const [timeSlotsFormat, setTimeSlotsFormat] = useState('Not set');
  const [preferredFormat, setPreferredFormat] = useState([]);

  // Calendar Integration States
  const [calendarStatus, setCalendarStatus] = useState({ provider: null, connected: false });
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  
  // Summary Report State
  const [summary, setSummary] = useState({ summary: [], totalTeaching: 0, totalLearning: 0 });
  
  // Active sidebar section for scroll highlighting
  const [activeSection, setActiveSection] = useState('teach');
  
  // Scroll to section
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(sectionId);
    }
  };
  
  // Completed sessions count
  const [completedSessionsCount, setCompletedSessionsCount] = useState(0);

  // Options matching chatbot
  const preferredDaysOptions = ['Weekdays only', 'Weekends only', 'Both weekdays and weekends', 'Flexible'];
  // Keep a previously saved value selectable even if it uses an older format
  const timezoneOptions = timeZone && timeZone !== 'Not set' && !allTimezoneOptions.includes(timeZone)
    ? [timeZone, ...allTimezoneOptions]
    : allTimezoneOptions;
  const preferredFormatOptions = ['Video Call', 'In-Person', 'Chat-Based', 'Flexible'];

  const fetchProfileAndReviews = async () => {
    if (!user) return;
    setLoading(true);
    setLoadingReviews(true);
    try {
      const res = await api.get('/profile');
      setProfile(res.data);
      setPreferredDays(res.data.availability?.preferredDays || 'Not set');
      setTimeZone(res.data.availability?.timeZone || 'Not set');
      setTimeSlotsFormat(res.data.availability?.format || 'Not set');
      setPreferredFormat(res.data.preferredFormat || []);
      setLoading(false);

      const reviewRes = await api.get(`/reviews/user/${user._id}`);
      setReviews(reviewRes.data);
      setLoadingReviews(false);

      // Fetch completed sessions count
      try {
        const sessionsRes = await api.get('/sessions');
        const completedSessions = sessionsRes.data.filter(s => s.status === 'completed');
        setCompletedSessionsCount(completedSessions.length);
      } catch (err) {
        console.error('Error fetching sessions:', err);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
      setLoadingReviews(false);
    }
  };

  useEffect(() => {
    fetchProfileAndReviews();
    fetchCalendarStatus();
    fetchSummary();
    // Fetch all user skills to build comprehensive skill list
    const loadAllSkills = async () => {
      const userSkills = await getAllUserSkills(api);
      // Combine predefined and user skills, remove duplicates
      const combined = [...new Set([...predefinedSkills, ...userSkills])].sort();
      setAllAvailableSkills(combined);
    };
    if (user) {
      loadAllSkills();
    }

    // Handle OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const calendar = urlParams.get('calendar');
    const status = urlParams.get('status');
    const msg = urlParams.get('msg');
    if (calendar && status) {
      if (status === 'connected') {
        // Refresh calendar status immediately and show success message
        fetchCalendarStatus().then(() => {
          alert(`Successfully connected to ${calendar === 'google' ? 'Google' : 'Outlook'} Calendar!`);
        }).catch((err) => {
          console.error('Error fetching calendar status after connection:', err);
          alert(`Successfully connected to ${calendar === 'google' ? 'Google' : 'Outlook'} Calendar!`);
        });
      } else if (status === 'error') {
        const errorMsg = msg ? decodeURIComponent(msg) : `Failed to connect to ${calendar === 'google' ? 'Google' : 'Outlook'} Calendar. Please try again.`;
        alert(errorMsg);
      }
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [user]);

  // Scroll detection for active section highlighting
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['teach', 'learn', 'availability', 'calendar', 'summary', 'reviews'];
      const scrollPosition = window.scrollY + 150; // Offset for navbar and padding

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i]);
        if (section) {
          const sectionTop = section.offsetTop;
          const sectionHeight = section.offsetHeight;
          const sectionBottom = sectionTop + sectionHeight;
          
          // Check if scroll position is within this section
          if (scrollPosition >= sectionTop - 100 && scrollPosition < sectionBottom - 100) {
            setActiveSection(sections[i]);
            break;
          }
        }
      }
    };

    // Initial check on load
    handleScroll();
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [profile]); // Re-run when profile loads

  const fetchCalendarStatus = async () => {
    try {
      const res = await api.get('/calendar/status');
      setCalendarStatus(res.data);
    } catch (err) {
      console.error('Error fetching calendar status:', err);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await api.get('/stats/summary');
      setSummary(res.data || { summary: [], totalTeaching: 0, totalLearning: 0 });
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  };

  const handleConnectCalendar = async (provider) => {
    try {
      setLoadingCalendar(true);
      const res = await api.get(`/calendar/${provider}/auth`);
      
      if (res.data.msg) {
        // Error message from server
        alert(res.data.msg);
        setLoadingCalendar(false);
        return;
      }
      
      if (!res.data.authUrl) {
        alert('Failed to get OAuth URL');
        setLoadingCalendar(false);
        return;
      }
      
      // Redirect to OAuth URL
      window.location.href = res.data.authUrl;
    } catch (err) {
      console.error('Error connecting calendar:', err);
      const errorMsg = err.response?.data?.msg || 'Failed to connect calendar. Please check if the calendar integration is properly configured.';
      alert(errorMsg);
      setLoadingCalendar(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!window.confirm('Are you sure you want to disconnect your calendar? This will stop automatic calendar invites for future sessions.')) {
      return;
    }
    try {
      await api.delete('/calendar/disconnect');
      setCalendarStatus({ provider: null, connected: false });
      alert('Calendar disconnected successfully');
    } catch (err) {
      console.error('Error disconnecting calendar:', err);
      alert('Failed to disconnect calendar');
    }
  };

  const handleAddSkill = async (skillType, skillName, setNewSkill, setShowAdd, setSearch) => {
    if (!skillName || !skillName.trim()) return;
    
    const normalizedSkill = normalizeSkillName(skillName);
    
    // Check if skill already exists in user's skills
    const existingSkills = profile[skillType] || [];
    if (existingSkills.some(s => s.toLowerCase() === normalizedSkill.toLowerCase())) {
      alert('This skill is already in your list');
      return;
    }
    
    try {
      const updatedSkills = [...existingSkills, normalizedSkill];
      const updatedProfile = { ...profile, [skillType]: updatedSkills };
      await api.put('/profile', updatedProfile);
      setProfile(updatedProfile);
      loadUser();

      // Add to available skills if it's new
      if (!allAvailableSkills.some(s => s.toLowerCase() === normalizedSkill.toLowerCase())) {
        setAllAvailableSkills([...allAvailableSkills, normalizedSkill].sort());
      }
      
      setNewSkill('');
      if (setSearch) setSearch('');
      setShowAdd(false);
    } catch (err) {
      console.error('Error adding skill:', err);
      alert('Failed to add skill');
    }
  };

  // Filter skills based on search query
  const getFilteredSkills = (searchQuery, skillType) => {
    if (!searchQuery.trim()) {
      return allAvailableSkills.filter(skill => {
        // Exclude skills already in user's list
        const userSkills = profile[skillType] || [];
        return !userSkills.some(s => s.toLowerCase() === skill.toLowerCase());
      });
    }
    
    const query = searchQuery.toLowerCase();
    return allAvailableSkills.filter(skill => {
      const userSkills = profile[skillType] || [];
      const isNotInList = !userSkills.some(s => s.toLowerCase() === skill.toLowerCase());
      return isNotInList && skill.toLowerCase().includes(query);
    });
  };

  const handleRemoveSkill = async (skillType, skillToRemove) => {
    const updatedSkills = (profile[skillType] || []).filter(skill => skill !== skillToRemove);
    if (skillType === 'skillsToTeach' && updatedSkills.length === 0) {
      alert('You need at least one skill to teach. Add another skill before removing this one.');
      return;
    }
    try {
      const updatedProfile = { ...profile, [skillType]: updatedSkills };
      await api.put('/profile', updatedProfile);
      setProfile(updatedProfile);
      loadUser();
    } catch (err) {
      console.error('Error removing skill:', err);
      alert('Failed to remove skill');
    }
  };

  const handleUpdateAvailability = async () => {
    try {
      const updatedAvailability = {
        preferredDays,
        timeZone,
        format: timeSlotsFormat
      };
      const updatedProfile = {
        ...profile,
        availability: updatedAvailability,
        preferredFormat
      };
      await api.put('/profile', updatedProfile);
      setProfile(updatedProfile);
      setEditingAvailability(false);
      loadUser();
    } catch (err) {
      console.error('Error updating availability:', err);
      alert('Failed to update availability');
    }
  };

  const handlePreferredFormatToggle = (format) => {
    if (preferredFormat.includes(format)) {
      setPreferredFormat(preferredFormat.filter(f => f !== format));
    } else {
      setPreferredFormat([...preferredFormat, format]);
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  if (loading) {
    return <div className="text-center p-10">Loading profile...</div>;
  }

  if (!profile) {
    return <div className="text-center p-10">Could not load profile.</div>;
  }

  const {
    skillsToTeach = [],
    skillsToLearn = [],
    averageRating = 0,
    hoursTaught = 0,
    peersConnected = 0,
    memberSince,
  } = profile;

  const displayName = user.username || 'User';
  const userTimezone = profile?.availability?.timeZone || 'Not set';
  const memberSinceDate = memberSince 
    ? formatDateOnly(memberSince, userTimezone, { year: 'numeric', month: 'short' })
    : 'Recently';

  // Calculate posts completed (sessions completed)
  const postsCompleted = completedSessionsCount;

  return (
    <div className="bg-gray-50 min-h-screen w-screen" style={{ marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', width: '100vw' }}>
      <div className="w-full px-8 py-8">
        <div className="flex gap-8">
          {/* Left Sidebar Navigation */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm p-4 sticky top-24">
              <nav className="space-y-2">
                <button
                  onClick={() => scrollToSection('teach')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeSection === 'teach'
                      ? 'bg-teal-50 text-teal-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <BookOpen size={20} />
                  <span>Skills I Can Teach</span>
                </button>
                <button
                  onClick={() => scrollToSection('learn')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeSection === 'learn'
                      ? 'bg-teal-50 text-teal-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <BookOpen size={20} />
                  <span>Skills I Want to Learn</span>
                </button>
                <button
                  onClick={() => scrollToSection('availability')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeSection === 'availability'
                      ? 'bg-teal-50 text-teal-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Calendar size={20} />
                  <span>Availability</span>
                </button>
                <button
                  onClick={() => scrollToSection('calendar')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeSection === 'calendar'
                      ? 'bg-teal-50 text-teal-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Calendar size={20} />
                  <span>Calendar Integration</span>
                </button>
                <button
                  onClick={() => scrollToSection('summary')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeSection === 'summary'
                      ? 'bg-teal-50 text-teal-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <FileText size={20} />
                  <span>Summary Report</span>
                </button>
                <button
                  onClick={() => scrollToSection('reviews')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeSection === 'reviews'
                      ? 'bg-teal-50 text-teal-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <MessageSquare size={20} />
                  <span>Reviews</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 space-y-8">
            {/* User Profile Header */}
            <div className="bg-white rounded-xl shadow-sm p-8">
              <div className="flex items-center gap-6">
                {/* Avatar */}
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white text-3xl font-bold flex-shrink-0">
                  {getInitials(displayName)}
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-800 mb-1">{displayName}</h1>
                  <p className="text-base text-gray-500">Member since {memberSinceDate}</p>
                </div>
              </div>

              {/* Stats Section */}
              <div className="grid grid-cols-3 gap-6 mt-8">
                <ProfileStat value={hoursTaught} label="Hours Taught" />
                <ProfileStat value={postsCompleted} label="Posts Completed" />
                <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-4xl font-bold text-gray-800">{averageRating.toFixed(1)}</p>
                    <span className="text-teal-600">
                      <svg className="w-6 h-6 fill-current" viewBox="0 0 20 20">
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                      </svg>
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-600 text-center">Rating</p>
                </div>
              </div>
            </div>

            {/* Skills I Can Teach */}
            <div id="teach" className="bg-white rounded-xl shadow-sm p-6 scroll-mt-8">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-2xl font-bold text-gray-800">Skills I Can Teach</h2>
                  <button
                    onClick={() => {
                      setShowAddSkillTeach(!showAddSkillTeach);
                      setShowAddSkillLearn(false);
                    }}
                    className="flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-4 py-2 rounded-lg transition-colors"
                  >
                    <Plus size={18} />
                    Add Skill
                  </button>
                </div>
          <div className="flex flex-wrap gap-3 mb-4">
            {skillsToTeach.length > 0 ? (
              skillsToTeach.map(skill => (
                <SkillPill
                  key={skill}
                  skill={skill}
                  onRemove={() => handleRemoveSkill('skillsToTeach', skill)}
                  color="bg-teal-500"
                />
              ))
            ) : (
              <p className="text-gray-500 text-sm">No skills added yet.</p>
            )}
          </div>
          {showAddSkillTeach && (
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                  placeholder="Search or type new skill..."
                  value={skillSearchTeach}
                  onChange={(e) => {
                    setSkillSearchTeach(e.target.value);
                    setNewSkillToTeach(e.target.value);
                  }}
                  autoFocus
                />
                {skillSearchTeach && getFilteredSkills(skillSearchTeach, 'skillsToTeach').length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {getFilteredSkills(skillSearchTeach, 'skillsToTeach').slice(0, 10).map((skill, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          handleAddSkill('skillsToTeach', skill, setNewSkillToTeach, setShowAddSkillTeach, setSkillSearchTeach);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-teal-50 transition-colors border-b border-gray-100 last:border-b-0"
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAddSkill('skillsToTeach', newSkillToTeach, setNewSkillToTeach, setShowAddSkillTeach, setSkillSearchTeach)}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-xl hover:from-teal-600 hover:to-teal-700 transition-all font-medium shadow-sm"
                >
                  Add {newSkillToTeach ? `"${normalizeSkillName(newSkillToTeach)}"` : 'Skill'}
                </button>
                <button
                  onClick={() => {
                    setShowAddSkillTeach(false);
                    setNewSkillToTeach('');
                    setSkillSearchTeach('');
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

            {/* Skills I Want to Learn */}
            <div id="learn" className="bg-white rounded-xl shadow-sm p-6 scroll-mt-8">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-2xl font-bold text-gray-800">Skills I Want to Learn</h2>
                <button
                  onClick={() => {
                    setShowAddSkillLearn(!showAddSkillLearn);
                    setShowAddSkillTeach(false);
                  }}
                  className="flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-4 py-2 rounded-lg transition-colors"
                >
                  <Plus size={18} />
                  Add Skill
                </button>
              </div>
          <div className="flex flex-wrap gap-3 mb-4">
            {skillsToLearn.length > 0 ? (
              skillsToLearn.map(skill => (
                <SkillPill
                  key={skill}
                  skill={skill}
                  onRemove={() => handleRemoveSkill('skillsToLearn', skill)}
                  color="bg-teal-500"
                />
              ))
            ) : (
              <p className="text-gray-500 text-sm">No skills added yet.</p>
            )}
          </div>
          {showAddSkillLearn && (
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                  placeholder="Search or type new skill..."
                  value={skillSearchLearn}
                  onChange={(e) => {
                    setSkillSearchLearn(e.target.value);
                    setNewSkillToLearn(e.target.value);
                  }}
                  autoFocus
                />
                {skillSearchLearn && getFilteredSkills(skillSearchLearn, 'skillsToLearn').length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {getFilteredSkills(skillSearchLearn, 'skillsToLearn').slice(0, 10).map((skill, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          handleAddSkill('skillsToLearn', skill, setNewSkillToLearn, setShowAddSkillLearn, setSkillSearchLearn);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-teal-50 transition-colors border-b border-gray-100 last:border-b-0"
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAddSkill('skillsToLearn', newSkillToLearn, setNewSkillToLearn, setShowAddSkillLearn, setSkillSearchLearn)}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-xl hover:from-teal-600 hover:to-teal-700 transition-all font-medium shadow-sm"
                >
                  Add {newSkillToLearn ? `"${normalizeSkillName(newSkillToLearn)}"` : 'Skill'}
                </button>
                <button
                  onClick={() => {
                    setShowAddSkillLearn(false);
                    setNewSkillToLearn('');
                    setSkillSearchLearn('');
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

            {/* Availability */}
            <div id="availability" className="bg-white rounded-xl shadow-sm p-6 scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-5">Availability</h2>
          {!editingAvailability ? (
            <>
              <div className="space-y-3 text-sm mb-6">
                <div>
                  <p className="text-gray-800">
                    <span className="font-medium">Preferred Days:</span> {preferredDays}
                  </p>
                </div>
                <div>
                  <p className="text-gray-800">
                    <span className="font-medium">Time Zone:</span> {timeZone}
                  </p>
                </div>
                <div>
                  <p className="text-gray-800">
                    <span className="font-medium">Time Slots:</span> {timeSlotsFormat !== 'Not set' ? timeSlotsFormat : 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-800">
                    <span className="font-medium">Mode of Learning:</span> {preferredFormat.length > 0 ? preferredFormat.join(', ') : 'Not set'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingAvailability(true)}
                className="w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white py-3 rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all font-medium shadow-sm hover:shadow-md"
              >
                Update Availability
              </button>
            </>
          ) : (
            <>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Days:</label>
                  <select
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white"
                    value={preferredDays}
                    onChange={(e) => setPreferredDays(e.target.value)}
                  >
                    <option value="Not set">Select Preferred Days</option>
                    {preferredDaysOptions.map((option, idx) => (
                      <option key={idx} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time Zone:</label>
                  <select
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white"
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                  >
                    <option value="Not set">Select Time Zone</option>
                    {timezoneOptions.map((option, idx) => (
                      <option key={idx} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time Slots:</label>
                  <TimeSlotManager
                    value={timeSlotsFormat}
                    onChange={setTimeSlotsFormat}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mode of Learning:</label>
                  <div className="space-y-2 border-2 border-gray-200 rounded-xl p-3 bg-gray-50">
                    {preferredFormatOptions.map((format, idx) => (
                      <label key={idx} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={preferredFormat.includes(format)}
                          onChange={() => handlePreferredFormatToggle(format)}
                          className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                        />
                        <span className="text-sm text-gray-700">{format}</span>
                      </label>
                    ))}
                  </div>
                  {preferredFormat.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-600 mb-1">Selected:</p>
                      <div className="flex flex-wrap gap-2">
                        {preferredFormat.map((format, idx) => (
                          <span key={idx} className="px-2 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-medium">
                            {format}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handleUpdateAvailability}
                  className="flex-1 bg-gradient-to-r from-teal-500 to-teal-600 text-white py-3 rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all font-medium shadow-sm hover:shadow-md"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingAvailability(false);
                    setPreferredDays(profile.availability?.preferredDays || 'Not set');
                    setTimeZone(profile.availability?.timeZone || 'Not set');
                    setTimeSlotsFormat(profile.availability?.format || 'Not set');
                    setPreferredFormat(profile.preferredFormat || []);
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg hover:bg-gray-300 transition-all font-medium"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
              </div>

            {/* Calendar Integration */}
            <div id="calendar" className="bg-white rounded-xl shadow-sm p-6 scroll-mt-8">
                <div className="flex items-center gap-3 mb-5">
                  <Calendar className="text-teal-600" size={24} />
                  <h2 className="text-2xl font-bold text-gray-800">Calendar Integration</h2>
                </div>
                
                {calendarStatus.connected ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle className="text-green-600" size={20} />
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">
                          Connected to {calendarStatus.provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'}
                        </p>
                        <p className="text-sm text-gray-600">
                          Your sessions will be automatically added to your calendar with reminders.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleDisconnectCalendar}
                      className="w-full bg-red-500 text-white py-3 rounded-lg hover:bg-red-600 transition-all font-medium shadow-sm hover:shadow-md"
                    >
                      Disconnect Calendar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-gray-600 mb-4">
                      Connect your calendar to automatically add session invites with reminders. Sessions will be synced to your calendar when confirmed.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button
                        onClick={() => handleConnectCalendar('google')}
                        disabled={loadingCalendar}
                        className="flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all font-medium text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-6 h-6" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Connect Google Calendar
                      </button>
                      <button
                        onClick={() => handleConnectCalendar('outlook')}
                        disabled={loadingCalendar}
                        className="flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all font-medium text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#0078D4">
                          <path d="M7.5 7.5h9v9h-9v-9zm1.5 1.5v6h6v-6h-6z"/>
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                        </svg>
                        Connect Outlook Calendar
                      </button>
                    </div>
                  </div>
                )}
              </div>

            {/* Summary Report */}
            <div id="summary" className="bg-white rounded-xl shadow-sm p-6 scroll-mt-8">
                {summary.summary.length > 0 ? (
                  <>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-teal-100 rounded-lg">
                        <Award className="text-teal-600" size={24} />
                      </div>
                      <h2 className="text-2xl font-bold text-gray-800">Summary Report</h2>
                    </div>
                  </div>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2 summary-scroll">
              <style>{`
                .summary-scroll::-webkit-scrollbar {
                  width: 6px;
                }
                .summary-scroll::-webkit-scrollbar-track {
                  background: #f3f4f6;
                  border-radius: 10px;
                }
                .summary-scroll::-webkit-scrollbar-thumb {
                  background: #14b8a6;
                  border-radius: 10px;
                }
                .summary-scroll::-webkit-scrollbar-thumb:hover {
                  background: #0d9488;
                }
              `}</style>
              {summary.summary.slice(0, 15).map((item, index) => {
                // Format text to make usernames, numbers, and skill names bold
                const formatText = (text) => {
                  // Split text and identify parts to bold: usernames, numbers, and number+skill combinations
                  const parts = [];
                  let processedText = text;
                  
                  // First, match "number + skill name" patterns (e.g., "2 Python", "1 Baking")
                  const numberSkillPattern = /(\d+\s+[A-Z][a-zA-Z]+)/g;
                  const numberSkillMatches = [];
                  let match;
                  
                  while ((match = numberSkillPattern.exec(text)) !== null) {
                    numberSkillMatches.push({
                      text: match[0],
                      index: match.index,
                      length: match[0].length
                    });
                  }
                  
                  // Then match standalone usernames (alphanumeric ending with digits)
                  const usernamePattern = /\b([a-zA-Z][a-zA-Z0-9]*\d+)\b/g;
                  const usernameMatches = [];
                  
                  while ((match = usernamePattern.exec(text)) !== null) {
                    // Check if this username is not already part of a number+skill match
                    const isOverlapping = numberSkillMatches.some(ms => 
                      match.index >= ms.index && match.index < ms.index + ms.length
                    );
                    if (!isOverlapping) {
                      usernameMatches.push({
                        text: match[0],
                        index: match.index,
                        length: match[0].length
                      });
                    }
                  }
                  
                  // Combine all matches and sort by index
                  const allMatches = [...numberSkillMatches, ...usernameMatches].sort((a, b) => a.index - b.index);
                  
                  // Remove overlaps (prefer number+skill over username)
                  const filteredMatches = [];
                  let lastEnd = 0;
                  allMatches.forEach(m => {
                    if (m.index >= lastEnd) {
                      filteredMatches.push(m);
                      lastEnd = m.index + m.length;
                    }
                  });
                  
                  // Build parts array
                  let lastIndex = 0;
                  filteredMatches.forEach((m) => {
                    if (m.index > lastIndex) {
                      parts.push({ text: text.substring(lastIndex, m.index), bold: false });
                    }
                    parts.push({ text: m.text, bold: true });
                    lastIndex = m.index + m.length;
                  });
                  
                  if (lastIndex < text.length) {
                    parts.push({ text: text.substring(lastIndex), bold: false });
                  }
                  
                  return parts.length > 0 ? parts : [{ text, bold: false }];
                };
                
                const formattedParts = formatText(item.text);
                
                return (
                  <div 
                    key={index}
                    className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50/30 transition-all duration-200"
                  >
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      item.type === 'barter' ? 'bg-teal-500' :
                      item.type === 'teaching' ? 'bg-blue-500' : 'bg-orange-500'
                    }`}></div>
                    <div className="flex-1">
                      <p className="text-gray-800 leading-relaxed font-semibold text-base">
                        {formattedParts.map((part, idx) => 
                          part.bold ? (
                            <span key={idx} className="font-bold text-gray-900">{part.text}</span>
                          ) : (
                            <span key={idx}>{part.text}</span>
                          )
                        )}
                      </p>
                      {item.type === 'barter' && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                            Taught: {item.totalTeachingHours.toFixed(1)}hrs
                          </div>
                          <div className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                            Learned: {item.totalLearningHours.toFixed(1)}hrs
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {summary.summary.length > 15 && (
                <div className="text-center pt-3 pb-2">
                  <p className="text-sm text-gray-500">
                    And {summary.summary.length - 15} more achievement{summary.summary.length - 15 !== 1 ? 's' : ''}...
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-gray-600">Teaching</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span className="text-gray-600">Learning</span>
                </div>
              </div>
              <div className="text-gray-600">
                Total: <span className="font-bold text-teal-600">{summary.totalTeaching.toFixed(1)}hrs</span> taught, <span className="font-bold text-orange-600">{summary.totalLearning.toFixed(1)}hrs</span> learned
                  </div>
                </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <Award className="text-gray-400 mx-auto mb-4" size={48} />
                    <p className="text-gray-500">No summary report available yet.</p>
                  </div>
                )}
              </div>

            {/* Reviews Section */}
            <div id="reviews" className="bg-white rounded-xl shadow-sm p-6 scroll-mt-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Reviews About Me</h2>
          {loadingReviews ? (
            <p className="text-gray-500">Loading reviews...</p>
          ) : reviews.length > 0 ? (
            <div className="space-y-4">
              {reviews.map(review => (
                <div key={review._id} className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow bg-gray-50">
                  <div className="flex items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-gray-800">{review.rating}.0</span>
                      <div className="flex text-yellow-400">
                        {[...Array(5)].map((_, i) => (
                          <span key={i}>{i < review.rating ? '★' : '☆'}</span>
                        ))}
                      </div>
                    </div>
                    <p className="text-gray-600 ml-4 font-medium">by {review.reviewer?.username || review.reviewerId?.username || 'Anonymous'}</p>
                    <p className="text-sm text-gray-400 ml-auto">on {formatDateOnly(review.date, userTimezone)}</p>
                  </div>
                  <p className="text-gray-700 italic">"{review.comment}"</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No reviews yet.</p>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
