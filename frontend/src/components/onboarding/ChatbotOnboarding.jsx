import React, { useState, useEffect, useRef } from 'react';
import { User } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import TimeSlotManager from '../common/TimeSlotManager';
import { predefinedSkills, normalizeSkillName } from '../../utils/skills';
import { timezoneOptions, getBrowserTimezone } from '../../utils/timezone';

// This is the chatbot component, extracted from your code.
// I've removed the 'auth' and 'dashboard' views from it.
const ChatbotOnboarding = () => {
  const { user, loadUser } = useAuth(); // Get user and the function to update context

  // --- All the state from your chatbot ---
  const [profileData, setProfileData] = useState({
    skillsToTeach: [],
    skillsToLearn: [],
    availability: {
      preferredDays: '',
      timeZone: '',
      format: ''
    },
    timeSlots: [],
    preferredFormat: []
  });

  const [messages, setMessages] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const messagesEndRef = useRef(null);

  // Skills the user typed that are not in the predefined list
  const [customSkills, setCustomSkills] = useState([]);
  const browserTimezone = getBrowserTimezone();
  // TimeSlots are now handled dynamically via TimeSlotManager component

  // --- All the functions from your chatbot ---
  // Use useMemo to ensure chatSteps is only created when user is available
  const chatSteps = React.useMemo(() => [
    {
      question: `Great to meet you, ${user?.username || 'there'}! 👋 Let's build your profile. First, what skills can you teach others?`,
      field: 'skillsToTeach',
      type: 'skill-select'
    },
    {
      question: "Awesome! Now, what skills would you like to learn?",
      field: 'skillsToLearn',
      type: 'skill-select',
      excludeSkills: true // Flag to exclude already selected teaching skills
    },
    {
      question: "Do you prefer weekdays, weekends, or both for your sessions?",
      field: 'preferredDays',
      type: 'choice',
      options: ['Weekdays only', 'Weekends only', 'Both weekdays and weekends', 'Flexible']
    },
    {
      question: `What's your timezone? Your device reports ${browserTimezone}.`,
      field: 'timeZone',
      type: 'dropdown',
      options: timezoneOptions
    },
    {
      question: "What time slots work best for you? Add your available time ranges:",
      field: 'timeSlots',
      type: 'timeSlots'
    },
    {
      question: "How would you prefer to connect with others? Select all that apply:",
      field: 'preferredFormat',
      type: 'multiple',
      options: ['Video Call', 'In-Person', 'Chat-Based', 'Flexible']
    }
  ], [user, browserTimezone]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Start the chat once the user is loaded. The ref and cleanup stop the
  // greeting from appearing twice (e.g. React StrictMode runs effects twice).
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current || messages.length > 0 || !user || chatSteps.length === 0) {
      return undefined;
    }
    const timer = setTimeout(() => {
      greeted.current = true;
      addBotMessage(chatSteps[0].question);
    }, 500);
    return () => clearTimeout(timer);
  }, [user, messages.length, chatSteps]);

  const addBotMessage = (text) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { sender: 'bot', text }]);
      setIsTyping(false);
    }, 800);
  };

  const addUserMessage = (text) => {
    setMessages(prev => [...prev, { sender: 'user', text }]);
  };

  const handleSkillSelect = (skill) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter(s => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  const confirmSkillSelection = () => {
    if (selectedSkills.length === 0) return;
    
    const step = chatSteps[currentStep];
    addUserMessage(selectedSkills.join(', '));
    setProfileData(prev => ({ ...prev, [step.field]: selectedSkills }));
    setSelectedSkills([]);
    setSearchQuery('');
    moveToNextStep();
  };

  const handleOptionClick = (option) => {
    const step = chatSteps[currentStep];

    if (step.type === 'choice') {
      addUserMessage(option);
      // Store in availability object for preferredDays
      if (step.field === 'preferredDays') {
        setProfileData(prev => ({
          ...prev,
          availability: {
            ...prev.availability,
            preferredDays: option
          }
        }));
      } else {
        setProfileData(prev => ({ ...prev, [step.field]: option }));
      }
      moveToNextStep();
    } else if (step.type === 'dropdown') {
      addUserMessage(option);
      // Store in availability object for timeZone
      if (step.field === 'timeZone') {
        setProfileData(prev => ({
          ...prev,
          availability: {
            ...prev.availability,
            timeZone: option
          }
        }));
      } else {
        setProfileData(prev => ({ ...prev, [step.field]: option }));
      }
      moveToNextStep();
    } else if (step.type === 'multiple') {
      const existing = profileData[step.field] || [];
      let newData;
      
      if (existing.includes(option)) {
        newData = existing.filter(item => item !== option);
      } else {
        newData = [...existing, option];
      }
      
      setProfileData(prev => ({ ...prev, [step.field]: newData }));
    }
  };

  const confirmMultipleSelection = () => {
    const step = chatSteps[currentStep];
    const selections = profileData[step.field];
    
    if (selections && selections.length > 0) {
      addUserMessage(selections.join(', '));
      moveToNextStep();
    }
  };

  const handleTimeSlotsChange = (timeSlotsString) => {
    setProfileData(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        format: timeSlotsString
      }
    }));
  };

  const confirmTimeSlotsSelection = () => {
    const timeSlotsFormat = profileData.availability?.format || 'Not set';
    if (timeSlotsFormat && timeSlotsFormat !== 'Not set') {
      addUserMessage(timeSlotsFormat);
      moveToNextStep();
    }
  };

  // --- MODIFIED moveToNextStep ---
  // This now calls our API on the final step
  const moveToNextStep = async () => {
    if (currentStep < chatSteps.length - 1) {
      // Not the final step, just move to the next question
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        addBotMessage(chatSteps[currentStep + 1].question);
      }, 1000);
    } else {
      // This is the final step
      setTimeout(async () => {
        addBotMessage("🎉 Fantastic! Your profile is complete. Saving...");
        try {
          // Prepare data for API - format availability properly
          const profilePayload = {
            skillsToTeach: profileData.skillsToTeach,
            skillsToLearn: profileData.skillsToLearn,
            availability: {
              preferredDays: profileData.availability.preferredDays || 'Not set',
              timeZone: profileData.availability.timeZone || 'Not set',
              format: profileData.availability.format || 'Not set'
            },
            preferredFormat: profileData.preferredFormat || []
          };

          // --- API CALL ---
          // Send the data to our backend
          await api.put('/profile', profilePayload);

          addBotMessage("Profile saved! Taking you to your dashboard...");
          
          // --- UPDATE CONTEXT ---
          // Tell AuthContext to reload the user data.
          // This will set 'profileComplete' to true.
          await loadUser(); 

          // The AppRouter will automatically detect this change
          // and redirect to the dashboard.
          
        } catch (err) {
          console.error("Failed to save profile:", err);
          addBotMessage("Oh no, something went wrong saving your profile. Please try again.");
        }
      }, 1000);
    }
  };

  // Filter skills - exclude already selected teaching skills when selecting learning skills
  const allSkills = [...new Set([...predefinedSkills, ...customSkills])];
  const filteredSkills = allSkills.filter(skill => {
    const matchesSearch = skill.toLowerCase().includes(searchQuery.toLowerCase());
    const currentStepData = chatSteps[currentStep];
    
    // If this is the learning skills step, exclude skills already in teaching
    if (currentStepData?.excludeSkills && profileData.skillsToTeach.length > 0) {
      const isAlreadyTeaching = profileData.skillsToTeach.some(
        teachSkill => teachSkill.toLowerCase() === skill.toLowerCase()
      );
      return matchesSearch && !isAlreadyTeaching;
    }
    
    return matchesSearch;
  });

  // Offer to add the typed text as a new skill when it isn't in the list
  const customSkillCandidate = normalizeSkillName(searchQuery);
  const canAddCustomSkill = customSkillCandidate.length > 1 &&
    !allSkills.some(skill => skill.toLowerCase() === customSkillCandidate.toLowerCase());

  const addCustomSkill = () => {
    if (!canAddCustomSkill) return;
    setCustomSkills(prev => [...prev, customSkillCandidate]);
    setSelectedSkills(prev => [...prev, customSkillCandidate]);
    setSearchQuery('');
  };

  // --- This is the Chatbot UI, using Tailwind CSS ---
  // Don't render until user is loaded
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const currentStepData = chatSteps[currentStep];
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-teal-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-t-2xl shadow-lg p-6 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center shadow-md">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800">Welcome, {user?.username}!</h2>
                <p className="text-sm text-gray-600">Let's set up your profile</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Progress</div>
              <div className="text-lg font-bold text-teal-600">
                {currentStep + 1}/{chatSteps.length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-lg p-6 overflow-y-auto" style={{ maxHeight: '600px' }}>
          <div className="space-y-4 pb-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-4 rounded-2xl ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-r from-teal-500 to-blue-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 p-4 rounded-2xl">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}

            {!isTyping && currentStep < chatSteps.length && (
              <div className="mt-4 pb-4">
                {/* Skill Selection */}
                {currentStepData.type === 'skill-select' && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomSkill();
                        }
                      }}
                      placeholder="Search skills, or type a new one..."
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                    />
                    {canAddCustomSkill && (
                      <button
                        onClick={addCustomSkill}
                        className="w-full text-left px-4 py-2 mb-3 rounded-lg border-2 border-dashed border-teal-300 text-teal-700 hover:bg-teal-50 transition"
                      >
                        + Add "{customSkillCandidate}"
                      </button>
                    )}
                    <div className="max-h-48 overflow-y-auto mb-3 space-y-2">
                      {filteredSkills.length > 0 || canAddCustomSkill ? (
                        filteredSkills.map((skill, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSkillSelect(skill)}
                            className={`w-full text-left px-4 py-2 rounded-lg transition ${
                              selectedSkills.includes(skill)
                                ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-sm'
                                : 'bg-white text-gray-700 hover:bg-teal-50 border border-gray-200'
                            }`}
                          >
                            {skill}
                          </button>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-2">
                          {currentStepData.excludeSkills && profileData.skillsToTeach.length > 0
                            ? 'No more skills available (you\'re already teaching all of them!)'
                            : 'No skills found'}
                        </p>
                      )}
                    </div>
                    {selectedSkills.length > 0 && (
                      <div className="mb-3">
                        <p className="text-sm text-gray-600 mb-2 font-medium">Selected skills:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedSkills.map((skill, idx) => (
                            <span key={idx} className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-medium border border-teal-200">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={confirmSkillSelection}
                      disabled={selectedSkills.length === 0}
                      className="w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white py-3 rounded-xl font-semibold hover:from-teal-600 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      Confirm Selection
                    </button>
                  </div>
                )}

                {/* Choice Buttons */}
                {currentStepData.type === 'choice' && (
                  <div className="flex flex-wrap gap-3">
                    {currentStepData.options.map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleOptionClick(option)}
                        className="px-6 py-3 bg-white border-2 border-teal-500 text-teal-600 rounded-xl hover:bg-teal-500 hover:text-white transition-all font-medium shadow-sm hover:shadow-md"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {/* Dropdown */}
                {currentStepData.type === 'dropdown' && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <select
                      onChange={(e) => handleOptionClick(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all bg-white"
                      defaultValue=""
                    >
                      <option value="" disabled>Select your timezone</option>
                      {currentStepData.options.map((option, idx) => (
                        <option key={idx} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Multiple Selection */}
                {currentStepData.type === 'multiple' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                      {currentStepData.options.map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleOptionClick(option)}
                          className={`px-6 py-3 rounded-xl font-medium transition-all shadow-sm hover:shadow-md ${
                            profileData[currentStepData.field]?.includes(option)
                              ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white'
                              : 'bg-white border-2 border-teal-500 text-teal-600 hover:bg-teal-500 hover:text-white'
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    {profileData[currentStepData.field]?.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm text-gray-600 mb-2 font-medium">Selected:</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {profileData[currentStepData.field].map((item, idx) => (
                            <span key={idx} className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-medium border border-teal-200">
                              {item}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={confirmMultipleSelection}
                          className="w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white py-4 rounded-xl font-semibold hover:from-teal-600 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl text-lg"
                        >
                          Continue →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Time Slots Manager */}
                {currentStepData.type === 'timeSlots' && (
                  <div className="space-y-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <TimeSlotManager
                      value={profileData.availability?.format || 'Not set'}
                      onChange={handleTimeSlotsChange}
                    />
                    {profileData.availability?.format && profileData.availability.format !== 'Not set' && (
                      <button
                        onClick={confirmTimeSlotsSelection}
                        className="w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white py-4 rounded-xl font-semibold hover:from-teal-600 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl text-lg"
                      >
                        Continue →
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="bg-white rounded-b-2xl shadow-lg p-6">
          <div className="text-center text-gray-500 text-sm">
            Select your preferences above to continue
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatbotOnboarding;