import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarX } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  formatDateInTimezone,
  formatMessageTime,
  getBrowserTimezone,
  getDateKeyInTimezone,
} from '../../utils/timezone';

// Shows a teacher's free time slots (from their availability, minus booked
// sessions) grouped by day, in the viewer's timezone.
const SlotPicker = ({ teacherId, teacherName, durationHours, value, onChange }) => {
  const { user } = useAuth();
  const timeZone = user?.availability?.timeZone;
  const timeZoneLabel = timeZone && timeZone !== 'Not set' ? timeZone : getBrowserTimezone();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get(`/sessions/availability/${teacherId}`, { params: { duration: durationHours, days: 14 } })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        // Drop a selection that no longer fits (e.g. after changing the duration)
        if (valueRef.current && !res.data.slots.some((slot) => slot.start === valueRef.current)) {
          onChange(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.msg || 'Could not load available times.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // onChange is intentionally not a dependency: parents often pass a new function each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, durationHours]);

  const days = useMemo(() => {
    const groups = new Map();
    (data?.slots || []).forEach((slot) => {
      const key = getDateKeyInTimezone(slot.start, timeZone);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(slot);
    });
    return [...groups.entries()].map(([key, slots]) => ({ key, slots }));
  }, [data, timeZone]);

  const activeDay = days.find((day) => day.key === selectedDay) || days[0];

  if (loading) {
    return <p className="text-sm text-gray-500 py-4 text-center">Loading available times...</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600 py-4 text-center">{error}</p>;
  }
  if (!data?.hasAvailability || days.length === 0) {
    return (
      <div className="text-center py-6 px-4 bg-gray-50 rounded-xl border-2 border-gray-100">
        <CalendarX className="mx-auto text-gray-300 mb-2" size={36} />
        <p className="text-sm font-medium text-gray-600">
          {!data?.hasAvailability
            ? `${teacherName || 'This teacher'} hasn't set their available times yet.`
            : 'No free slots in the next 14 days.'}
        </p>
        <p className="text-xs text-gray-500 mt-1">Propose a custom time instead, or let them choose.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Days */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {days.map((day) => {
          const isActive = day.key === activeDay.key;
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => setSelectedDay(day.key)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                isActive ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:border-teal-300'
              }`}
            >
              <span className="block">
                {formatDateInTimezone(day.slots[0].start, timeZone, { weekday: 'short', month: 'short', day: 'numeric', hour: undefined, minute: undefined })}
              </span>
              <span className="block text-[11px] text-gray-400">{day.slots.length} free</span>
            </button>
          );
        })}
      </div>

      {/* Times for the selected day */}
      <div className="grid grid-cols-3 gap-2 mt-2 max-h-48 overflow-y-auto">
        {activeDay.slots.map((slot) => {
          const isSelected = value === slot.start;
          return (
            <button
              key={slot.start}
              type="button"
              onClick={() => onChange(isSelected ? null : slot.start)}
              className={`px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-md'
                  : 'bg-gray-50 text-gray-700 hover:bg-teal-50 border border-gray-200'
              }`}
            >
              {formatMessageTime(slot.start, timeZone)}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-2">Times are shown in your timezone ({timeZoneLabel}).</p>
    </div>
  );
};

export default SlotPicker;
