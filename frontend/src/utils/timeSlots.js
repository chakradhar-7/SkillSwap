/**
 * Utility functions for managing dynamic time slots
 */

/**
 * Parse a time string (e.g., "9:00 AM" or "21:30") to 24-hour format
 * @param {string} timeString - Time in various formats
 * @returns {number} - Minutes from midnight (0-1439)
 */
export const parseTimeToMinutes = (timeString) => {
  if (!timeString) return null;

  // Remove extra spaces
  const cleaned = timeString.trim().toUpperCase();

  // Match patterns like "9:00 AM", "9:00AM", "21:00" and "9 AM"
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/) || cleaned.match(/^(\d{1,2})()\s*(AM|PM)$/);
  if (!match) {
    return null;
  }

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3];

  if (minutes > 59) {
    return null;
  }

  if (ampm) {
    // 12-hour clock: hours must be 1-12
    if (hours < 1 || hours > 12) {
      return null;
    }
    if (ampm === 'PM' && hours !== 12) {
      hours += 12;
    } else if (ampm === 'AM' && hours === 12) {
      hours = 0;
    }
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
};

/**
 * Convert minutes from midnight to formatted time string
 * @param {number} minutes - Minutes from midnight (0-1439)
 * @param {boolean} use24Hour - Whether to use 24-hour format
 * @returns {string} - Formatted time string
 */
export const formatMinutesToTime = (minutes, use24Hour = false) => {
  if (minutes === null || minutes === undefined || minutes < 0 || minutes >= 1440) {
    return '';
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (use24Hour) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  // 12-hour format
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return `${displayHours}:${String(mins).padStart(2, '0')} ${ampm}`;
};

/**
 * Parse time slot string to array of time ranges
 * Handles both old format ("Early Morning (6AM-9AM)") and new format ("9:00 AM - 12:00 PM")
 * @param {string} timeSlotString - Comma-separated time slot string
 * @returns {Array<{start: number, end: number, id: string}>} - Array of time ranges
 */
export const parseTimeSlots = (timeSlotString) => {
  if (!timeSlotString || timeSlotString === 'Not set' || timeSlotString.trim() === '') {
    return [];
  }

  const slots = [];
  const parts = timeSlotString.split(',').map(s => s.trim()).filter(s => s);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Check if it's the new format: "9:00 AM - 12:00 PM" or "09:00-12:00"
    const rangeMatch = part.match(/(.+?)\s*-\s*(.+)/);
    if (rangeMatch) {
      const startStr = rangeMatch[1].trim();
      const endStr = rangeMatch[2].trim();
      
      const startMinutes = parseTimeToMinutes(startStr);
      const endMinutes = parseTimeToMinutes(endStr);

      if (startMinutes !== null && endMinutes !== null) {
        slots.push({
          id: `slot-${i}-${Date.now()}`,
          start: startMinutes,
          end: endMinutes,
          original: part
        });
        continue;
      }
    }

    // Old format: predefined slots like "Early Morning (6AM-9AM)"
    // Try to extract times from parentheses
    const oldFormatMatch = part.match(/\((\d{1,2})(AM|PM)?-(\d{1,2})(AM|PM)?\)/i);
    if (oldFormatMatch) {
      const startHour = parseInt(oldFormatMatch[1], 10);
      const startAmpm = oldFormatMatch[2]?.toUpperCase();
      const endHour = parseInt(oldFormatMatch[3], 10);
      const endAmpm = oldFormatMatch[4]?.toUpperCase();

      let startMinutes = startHour * 60;
      let endMinutes = endHour * 60;

      if (startAmpm === 'PM' && startHour !== 12) startMinutes += 12 * 60;
      if (startAmpm === 'AM' && startHour === 12) startMinutes = 0;
      if (endAmpm === 'PM' && endHour !== 12) endMinutes += 12 * 60;
      if (endAmpm === 'AM' && endHour === 12) endMinutes = 0;
      // An end before the start means the range wraps to the next day;
      // minutes stay within 0-1439 and the validators handle the wrap.

      slots.push({
        id: `slot-${i}-${Date.now()}`,
        start: startMinutes,
        end: endMinutes,
        original: part
      });
      continue;
    }

    // If it's "Flexible", skip it or handle separately
    if (part.toLowerCase() === 'flexible') {
      continue; // Skip flexible for now
    }
  }

  return slots;
};

/**
 * Convert time ranges array to string format for storage
 * @param {Array<{start: number, end: number}>} timeRanges - Array of time ranges
 * @returns {string} - Comma-separated string format
 */
export const formatTimeSlotsToString = (timeRanges) => {
  if (!timeRanges || timeRanges.length === 0) {
    return 'Not set';
  }

  return timeRanges
    .filter(range => range.start !== null && range.end !== null)
    .map(range => {
      const startTime = formatMinutesToTime(range.start, false);
      const endTime = formatMinutesToTime(range.end, false);
      return `${startTime} - ${endTime}`;
    })
    .join(', ');
};

/**
 * Validate a time range
 * @param {number} startMinutes - Start time in minutes
 * @param {number} endMinutes - End time in minutes
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
export const validateTimeRange = (startMinutes, endMinutes) => {
  if (startMinutes === null || endMinutes === null) {
    return { valid: false, error: 'Both start and end times are required' };
  }

  if (startMinutes < 0 || startMinutes >= 1440 || endMinutes < 0 || endMinutes >= 1440) {
    return { valid: false, error: 'Invalid time values' };
  }

  // Allow wrap-around (e.g., 11 PM - 2 AM)
  // For same-day ranges, end should be after start
  // For wrap-around, end will be less than start (handled by adding 24 hours)
  const normalizedEnd = endMinutes < startMinutes ? endMinutes + 1440 : endMinutes;
  
  // Minimum duration: 30 minutes
  if (normalizedEnd - startMinutes < 30) {
    return { valid: false, error: 'Time range must be at least 30 minutes' };
  }

  // Maximum duration: 24 hours
  if (normalizedEnd - startMinutes > 1440) {
    return { valid: false, error: 'Time range cannot exceed 24 hours' };
  }

  return { valid: true };
};

/**
 * Check if two time ranges overlap
 * @param {Object} range1 - First range {start: number, end: number}
 * @param {Object} range2 - Second range {start: number, end: number}
 * @returns {boolean} - True if ranges overlap
 */
export const rangesOverlap = (range1, range2) => {
  // Normalize ranges (handle wrap-around)
  const normalizeRange = (range) => {
    if (range.end < range.start) {
      // Wrap-around case: split into two ranges
      return [
        { start: range.start, end: 1440 },
        { start: 0, end: range.end }
      ];
    }
    return [{ start: range.start, end: range.end }];
  };

  const ranges1 = normalizeRange(range1);
  const ranges2 = normalizeRange(range2);

  // Check overlap between any normalized ranges
  for (const r1 of ranges1) {
    for (const r2 of ranges2) {
      if (r1.start < r2.end && r1.end > r2.start) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Merge overlapping time ranges
 * @param {Array<{start: number, end: number}>} ranges - Array of time ranges
 * @returns {Array<{start: number, end: number}>} - Merged ranges
 */
export const mergeOverlappingRanges = (ranges) => {
  if (!ranges || ranges.length === 0) return [];

  // Sort by start time
  const sorted = [...ranges].sort((a, b) => a.start - b.start);

  const merged = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    
    // Normalize for wrap-around comparison
    const currentEnd = current.end < current.start ? current.end + 1440 : current.end;
    const nextStart = next.start;
    const nextEnd = next.end < next.start ? next.end + 1440 : next.end;

    // Check if ranges overlap or are adjacent (within 1 minute)
    if (nextStart <= currentEnd + 1 || currentEnd >= 1439) {
      // Merge: extend current range
      if (nextEnd > currentEnd) {
        current.end = next.end >= next.start ? next.end : next.end + 1440;
        if (current.end >= 1440) current.end -= 1440;
      }
    } else {
      // No overlap: save current and start new
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
};

/**
 * Create a new empty time range
 * @returns {{id: string, start: number|null, end: number|null}}
 */
export const createEmptyTimeRange = () => {
  return {
    id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    start: null,
    end: null
  };
};

