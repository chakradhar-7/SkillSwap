import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, BookOpen, Coins, Search, X } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import SlotPicker from './SlotPicker';
import { getSwapMatch } from '../../utils/matching';
import { formatCredits, sessionCost } from '../../utils/credits';
import {
  formatFullDateTime,
  fromDateTimeInputValue,
  toDateTimeInputValue,
} from '../../utils/timezone';

const DURATIONS = [0.5, 1, 1.5, 2, 3];
const TIME_MODES = [
  { id: 'slot', label: 'Pick a free slot' },
  { id: 'custom', label: 'Custom time' },
  { id: 'none', label: 'Let them decide' },
];

/**
 * Request a session with a teacher: choose a skill they teach, a duration and
 * (optionally) a time from their free slots.
 * `teacher` needs at least { _id, username }; skills are loaded if missing.
 * `onSent({ skill, proposedTime, durationHours })` runs after a successful request.
 */
const RequestSessionModal = ({ teacher, onClose, onSent }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const timeZone = user?.availability?.timeZone;
  const hasFullProfile = Array.isArray(teacher.skillsToTeach) && Array.isArray(teacher.skillsToLearn);
  const [teacherProfile, setTeacherProfile] = useState(hasFullProfile ? teacher : null);
  const teacherSkills = teacherProfile ? teacherProfile.skillsToTeach || [] : null;
  const [paymentType, setPaymentType] = useState(null);
  const [search, setSearch] = useState('');
  const [skill, setSkill] = useState('');
  const [durationHours, setDurationHours] = useState(1);
  const [timeMode, setTimeMode] = useState('slot');
  const [slot, setSlot] = useState(null);
  const [customTime, setCustomTime] = useState('');
  const [sending, setSending] = useState(false);

  // Load the teacher's profile (skills) if the caller didn't have it
  useEffect(() => {
    if (teacherProfile) return;
    api.get(`/profile/user/${teacher._id}`)
      .then((res) => setTeacherProfile(res.data))
      .catch(() => setTeacherProfile({ skillsToTeach: [], skillsToLearn: [] }));
  }, [teacher._id, teacherProfile]);

  const balance = user?.credits ?? 0;
  const cost = sessionCost(durationHours);
  const canAffordCredits = balance >= cost;
  // Skills of yours that this teacher wants - a barter is likely to be accepted
  const youCanTeachThem = teacherProfile ? getSwapMatch(user, teacherProfile).iCanTeachThem : [];

  // Default payment: barter if they want one of your skills, otherwise credits if affordable
  useEffect(() => {
    if (paymentType || !teacherProfile) return;
    setPaymentType(youCanTeachThem.length > 0 || !canAffordCredits ? 'barter' : 'credits');
  }, [teacherProfile, paymentType, youCanTeachThem.length, canAffordCredits]);

  // A longer session can make credits unaffordable
  useEffect(() => {
    if (paymentType === 'credits' && !canAffordCredits) setPaymentType('barter');
  }, [paymentType, canAffordCredits]);

  // Pre-select a skill you want to learn that they teach
  useEffect(() => {
    if (skill || !teacherSkills?.length) return;
    const wanted = (user?.skillsToLearn || []).map((s) => s.toLowerCase());
    const match = teacherSkills.find((s) => wanted.includes(s.toLowerCase()));
    setSkill(match || (teacherSkills.length === 1 ? teacherSkills[0] : ''));
  }, [teacherSkills, user, skill]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const filteredSkills = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (teacherSkills || []).filter((s) => !query || s.toLowerCase().includes(query));
  }, [teacherSkills, search]);

  const proposedTime =
    timeMode === 'slot' ? slot
      : timeMode === 'custom' ? fromDateTimeInputValue(customTime, timeZone)
        : null;

  const handleSubmit = async () => {
    if (!skill) {
      showToast('Please choose a skill to learn', 'warning');
      return;
    }
    if (paymentType === 'credits' && !canAffordCredits) {
      showToast(`You need ${formatCredits(cost)} for this session but have ${formatCredits(balance)}`, 'warning');
      return;
    }
    if (timeMode === 'slot' && !slot) {
      showToast('Pick a time slot, or choose "Custom time" or "Let them decide"', 'warning');
      return;
    }
    if (timeMode === 'custom' && !proposedTime) {
      showToast('Please enter a date and time', 'warning');
      return;
    }

    setSending(true);
    try {
      await api.post('/sessions/request', {
        teacherId: teacher._id,
        skill,
        ...(proposedTime ? { proposedTime } : {}),
        durationHours,
        paymentType: paymentType || 'barter',
      });
      showToast('Session request sent!', 'success');
      if (onSent) onSent({ skill, proposedTime, durationHours, paymentType: paymentType || 'barter' });
      onClose();
    } catch (err) {
      showToast(err.response?.data?.msg || 'Could not send the request. Please try again.', 'error');
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-500 to-teal-600 p-6 rounded-t-2xl relative flex-shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Close">
            <X size={24} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <BookOpen size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Request Session</h2>
              <p className="text-teal-100 text-sm">with {teacher.username}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* 1. Skill */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">1. What do you want to learn?</h3>
            {teacherSkills === null ? (
              <p className="text-sm text-gray-500">Loading skills...</p>
            ) : teacherSkills.length === 0 ? (
              <p className="text-sm text-orange-600">{teacher.username} hasn't added any skills to teach yet.</p>
            ) : (
              <>
                {teacherSkills.length > 6 && (
                  <div className="relative mb-2">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search their skills..."
                      className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                  </div>
                )}
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {filteredSkills.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSkill(s)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        skill === s
                          ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-md'
                          : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-teal-50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                  {filteredSkills.length === 0 && <p className="text-sm text-gray-500">No matching skills.</p>}
                </div>
              </>
            )}
          </section>

          {/* 2. Duration */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">2. How long?</h3>
            <div className="flex gap-2 flex-wrap">
              {DURATIONS.map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => setDurationHours(hours)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    durationHours === hours
                      ? 'bg-teal-500 text-white'
                      : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-teal-50'
                  }`}
                >
                  {hours < 1 ? '30 min' : `${hours} hr${hours > 1 ? 's' : ''}`}
                </button>
              ))}
            </div>
          </section>

          {/* 3. Payment */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">3. How will you pay?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentType('barter')}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  paymentType === 'barter' ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-200'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <ArrowLeftRight size={16} className="text-violet-600" />
                  Barter
                </span>
                <span className="block text-xs text-gray-500 mt-1">
                  {youCanTeachThem.length > 0
                    ? `They want to learn ${youCanTeachThem.join(', ')} - teach it in return.`
                    : `${teacher.username} picks one of your skills to learn in return. None of your skills are on their wishlist yet.`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => canAffordCredits && setPaymentType('credits')}
                disabled={!canAffordCredits}
                className={`text-left p-3 rounded-xl border-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                  paymentType === 'credits' ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-amber-200'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <Coins size={16} className="text-amber-600" />
                  Pay with credits
                </span>
                <span className="block text-xs text-gray-500 mt-1">
                  {formatCredits(cost)} per session · you have {formatCredits(balance)}
                  {!canAffordCredits && ' (not enough)'}
                </span>
              </button>
            </div>
            {paymentType === 'credits' && (
              <p className="text-xs text-gray-500 mt-2">
                Credits are reserved when {teacher.username} confirms the schedule, paid to them as each session is completed, and refunded if a session is cancelled.
              </p>
            )}
          </section>

          {/* 4. Time */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">4. When?</h3>
            <div className="flex rounded-lg border border-gray-200 p-1 mb-3">
              {TIME_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setTimeMode(mode.id)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    timeMode === mode.id ? 'bg-teal-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {timeMode === 'slot' && (
              <SlotPicker
                teacherId={teacher._id}
                teacherName={teacher.username}
                durationHours={durationHours}
                value={slot}
                onChange={setSlot}
              />
            )}
            {timeMode === 'custom' && (
              <div>
                <input
                  type="datetime-local"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  min={toDateTimeInputValue(new Date(), timeZone)}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-xs text-gray-400 mt-1">The teacher may not be free then - they'll confirm the final schedule.</p>
              </div>
            )}
            {timeMode === 'none' && (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-xl p-3">
                {teacher.username} will pick the days and time when accepting your request.
              </p>
            )}
          </section>

          {/* Summary */}
          {skill && (
            <div className="p-3 bg-teal-50 border-2 border-teal-200 rounded-xl text-sm text-teal-800">
              <strong>{skill}</strong> for {durationHours < 1 ? '30 minutes' : `${durationHours} hour${durationHours > 1 ? 's' : ''}`}
              {proposedTime ? <> on <strong>{formatFullDateTime(proposedTime, timeZone)}</strong></> : null}
              {paymentType === 'credits'
                ? <> · <strong>{formatCredits(cost)}</strong> per session</>
                : <> · barter</>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-6 pt-0 flex-shrink-0">
          <button
            onClick={handleSubmit}
            disabled={sending || !skill}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-xl hover:from-teal-600 hover:to-teal-700 transition-all font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <BookOpen size={18} />
            <span>{sending ? 'Sending...' : 'Send Request'}</span>
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequestSessionModal;
