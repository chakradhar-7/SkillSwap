import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, X, AlertCircle } from 'lucide-react';
import {
  parseTimeSlots,
  formatTimeSlotsToString,
  formatMinutesToTime,
  parseTimeToMinutes,
  validateTimeRange,
  rangesOverlap,
  createEmptyTimeRange
} from '../../utils/timeSlots';

// Time options for the dropdowns (every 30 minutes)
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => ({
  value: i * 30,
  label: formatMinutesToTime(i * 30, false),
}));

const rangesFromValue = (value) => {
  const parsed = value && value !== 'Not set' ? parseTimeSlots(value) : [];
  return parsed.length > 0 ? parsed : [createEmptyTimeRange()];
};

const isComplete = (range) => range.start !== null && range.end !== null;

// Validation errors keyed by range id. A range is checked for its own validity
// first, then for overlap with the valid ranges before it.
const computeErrors = (ranges) => {
  const errors = {};
  const accepted = [];
  ranges.forEach((range) => {
    if (range.invalidInput) {
      errors[range.id] = 'Enter a time like 9:00 AM or 21:30';
      return;
    }
    if (!isComplete(range)) return;
    const validation = validateTimeRange(range.start, range.end);
    if (!validation.valid) {
      errors[range.id] = validation.error;
    } else if (accepted.some((other) => rangesOverlap(range, other))) {
      errors[range.id] = 'This time range overlaps with another range';
    } else {
      accepted.push(range);
    }
  });
  return errors;
};

// Only complete, valid, non-overlapping ranges are reported to the parent
const serialize = (ranges) => {
  const errors = computeErrors(ranges);
  const valid = ranges.filter((range) => isComplete(range) && !errors[range.id]);
  return valid.length > 0 ? formatTimeSlotsToString(valid) : 'Not set';
};

const TimeSlotManager = ({ value, onChange, disabled = false }) => {
  const [timeRanges, setTimeRanges] = useState(() => rangesFromValue(value));
  // The last string we reported (or received), so our own updates coming back
  // through `value` don't reset what the user is editing.
  const lastValue = useRef(value);

  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setTimeRanges(rangesFromValue(value));
    }
  }, [value]);

  const errors = useMemo(() => computeErrors(timeRanges), [timeRanges]);

  // Apply an edit and notify the parent only when the saved value changes.
  // This runs in event handlers, never in an effect, so it cannot loop.
  const commit = (nextRanges) => {
    setTimeRanges(nextRanges);
    const nextValue = serialize(nextRanges);
    if (nextValue !== lastValue.current) {
      lastValue.current = nextValue;
      onChange(nextValue);
    }
  };

  const addTimeRange = () => {
    commit([...timeRanges, createEmptyTimeRange()]);
  };

  const removeTimeRange = (id) => {
    if (timeRanges.length > 1) {
      commit(timeRanges.filter((range) => range.id !== id));
    }
  };

  const updateTimeRange = (id, field, minutes) => {
    commit(timeRanges.map((range) => {
      if (range.id !== id) return range;
      const updated = { ...range, [field]: minutes, invalidInput: false };
      delete updated[`${field}String`];
      return updated;
    }));
  };

  // Free-text typing is kept as a draft until the input loses focus
  const handleTimeInputChange = (id, field, timeString) => {
    setTimeRanges(timeRanges.map((range) =>
      range.id === id ? { ...range, [`${field}String`]: timeString } : range
    ));
  };

  const handleTimeInputBlur = (id, field) => {
    const range = timeRanges.find((r) => r.id === id);
    const draft = range?.[`${field}String`];
    if (draft === undefined) return;

    if (draft.trim() === '') {
      updateTimeRange(id, field, null);
      return;
    }
    const minutes = parseTimeToMinutes(draft);
    if (minutes === null) {
      commit(timeRanges.map((r) => (r.id === id ? { ...r, invalidInput: true } : r)));
    } else {
      updateTimeRange(id, field, minutes);
    }
  };

  // Include a typed time that isn't on the 30-minute grid so the select can show it
  const optionsFor = (minutes) =>
    minutes === null || minutes % 30 === 0
      ? TIME_OPTIONS
      : [...TIME_OPTIONS, { value: minutes, label: formatMinutesToTime(minutes, false) }].sort((a, b) => a.value - b.value);

  return (
    <div className="space-y-3">
      {timeRanges.map((range) => {
        const rangeError = errors[range.id];
        const startValue = range.startString !== undefined
          ? range.startString
          : (range.start !== null ? formatMinutesToTime(range.start, false) : '');
        const endValue = range.endString !== undefined
          ? range.endString
          : (range.end !== null ? formatMinutesToTime(range.end, false) : '');

        return (
          <div key={range.id} className="relative">
            <div className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${
              rangeError
                ? 'border-red-300 bg-red-50'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300'
            }`}>
              {/* Start Time */}
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Start Time
                </label>
                <select
                  value={range.start !== null ? range.start : ''}
                  onChange={(e) => {
                    const minutes = e.target.value !== '' ? parseInt(e.target.value, 10) : null;
                    updateTimeRange(range.id, 'start', minutes);
                  }}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white text-sm"
                >
                  <option value="">Select start time</option>
                  {optionsFor(range.start).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {/* Allow custom time input as fallback */}
                <input
                  type="text"
                  value={startValue}
                  onChange={(e) => handleTimeInputChange(range.id, 'start', e.target.value)}
                  onBlur={() => handleTimeInputBlur(range.id, 'start')}
                  placeholder="Or type: 9:00 AM"
                  disabled={disabled}
                  className="mt-1 w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-gray-50 text-sm text-gray-600"
                />
              </div>

              {/* Dash */}
              <div className="flex-shrink-0 pt-6 text-gray-500 font-medium">-</div>

              {/* End Time */}
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  End Time
                </label>
                <select
                  value={range.end !== null ? range.end : ''}
                  onChange={(e) => {
                    const minutes = e.target.value !== '' ? parseInt(e.target.value, 10) : null;
                    updateTimeRange(range.id, 'end', minutes);
                  }}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white text-sm"
                >
                  <option value="">Select end time</option>
                  {optionsFor(range.end).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {/* Allow custom time input as fallback */}
                <input
                  type="text"
                  value={endValue}
                  onChange={(e) => handleTimeInputChange(range.id, 'end', e.target.value)}
                  onBlur={() => handleTimeInputBlur(range.id, 'end')}
                  placeholder="Or type: 5:00 PM"
                  disabled={disabled}
                  className="mt-1 w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-gray-50 text-sm text-gray-600"
                />
              </div>

              {/* Remove Button */}
              {timeRanges.length > 1 && !disabled && (
                <button
                  type="button"
                  onClick={() => removeTimeRange(range.id)}
                  className="flex-shrink-0 p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                  title="Remove time slot"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Error Message */}
            {rangeError && (
              <div className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={14} />
                <span>{rangeError} (this slot won't be saved)</span>
              </div>
            )}

            {/* Helper Text for wrap-around */}
            {isComplete(range) && range.end < range.start && !rangeError && (
              <div className="mt-1 text-xs text-blue-600">
                <span className="font-medium">Note:</span> This time range wraps around to the next day (e.g., 11 PM - 2 AM)
              </div>
            )}
          </div>
        );
      })}

      {/* Add Button */}
      {!disabled && (
        <button
          type="button"
          onClick={addTimeRange}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-teal-500 hover:text-teal-600 hover:bg-teal-50 transition-colors"
        >
          <Plus size={18} />
          <span className="font-medium">Add Another Time Slot</span>
        </button>
      )}

      {/* Help Text */}
      <div className="text-xs text-gray-500 mt-2">
        <p>• You can add multiple time slots</p>
        <p>• Each slot must be at least 30 minutes</p>
        <p>• Time slots can wrap around (e.g., 11 PM - 2 AM)</p>
        <p>• Overlapping ranges are not allowed</p>
      </div>
    </div>
  );
};

export default TimeSlotManager;
