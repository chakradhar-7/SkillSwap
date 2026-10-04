/**
 * Timezone utility functions for converting dates based on user's timezone settings
 */

const OFFSETS = [
  '-12:00', '-11:00', '-10:00', '-09:30', '-09:00', '-08:00', '-07:00', '-06:00',
  '-05:00', '-04:00', '-03:30', '-03:00', '-02:00', '-01:00', '+00:00', '+01:00',
  '+02:00', '+03:00', '+03:30', '+04:00', '+04:30', '+05:00', '+05:30', '+05:45',
  '+06:00', '+06:30', '+07:00', '+08:00', '+08:45', '+09:00', '+09:30', '+10:00',
  '+10:30', '+11:00', '+12:00', '+12:45', '+13:00', '+14:00',
];

// All UTC offsets in use worldwide, as "GMT+05:30" style strings
export const timezoneOptions = OFFSETS.map((offset) => `GMT${offset}`);

// The browser's current UTC offset as a "GMT+05:30" style string
export const getBrowserTimezone = () => {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `GMT${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};

/**
 * Parse GMT offset from timezone string (e.g., "GMT+05:30 (IST)" -> 5.5 hours).
 * Falls back to the browser's offset when the profile timezone is not set.
 * @param {string} timezoneString - The timezone string from user profile
 * @returns {number} - Offset in hours (e.g., 5.5 for GMT+05:30)
 */
export const parseTimezoneOffset = (timezoneString) => {
  const match = typeof timezoneString === 'string'
    ? timezoneString.match(/GMT([+-])(\d{1,2}):(\d{2})/)
    : null;

  if (!match) {
    return -new Date().getTimezoneOffset() / 60;
  }

  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);

  return sign * (hours + minutes / 60);
};

/**
 * The user's UTC offset in minutes (positive east of UTC).
 * Uses the profile timezone when set, otherwise the browser's.
 */
export const getUtcOffsetMinutes = (timezoneString) =>
  Math.round(parseTimezoneOffset(timezoneString) * 60);

/**
 * Convert a date to a value for <input type="datetime-local"> in the user's timezone.
 * (Date.toISOString() would give UTC wall-clock time, which shifts the time.)
 */
export const toDateTimeInputValue = (date, timezoneString) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const shifted = new Date(d.getTime() + getUtcOffsetMinutes(timezoneString) * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
};

/**
 * Convert an <input type="datetime-local"> value, interpreted in the user's
 * timezone, to an ISO (UTC) string. Returns null for empty/invalid input.
 */
export const fromDateTimeInputValue = (value, timezoneString) => {
  if (!value || !value.includes('T')) return null;
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  if ([year, month, day, hours, minutes].some((n) => Number.isNaN(n))) return null;
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes) - getUtcOffsetMinutes(timezoneString) * 60 * 1000;
  return new Date(utcMs).toISOString();
};

/**
 * Calendar date ("YYYY-MM-DD") of a moment in the user's timezone
 */
export const getDateKeyInTimezone = (date, timezoneString) =>
  toDateTimeInputValue(date, timezoneString).slice(0, 10);

/**
 * Convert a UTC date to user's local timezone
 * @param {Date|string} utcDate - The UTC date (Date object or ISO string)
 * @param {string} userTimezone - The user's timezone string (e.g., "GMT+05:30")
 * @returns {Date} - Date object adjusted to user's timezone (but still represents UTC internally)
 */
export const convertToUserTimezone = (utcDate, userTimezone) => {
  if (!utcDate) return null;
  
  const date = new Date(utcDate);
  if (isNaN(date.getTime())) return null;

  const offsetHours = parseTimezoneOffset(userTimezone);
  
  // Create a new date in the user's timezone
  // We add the offset to get the local time representation
  const utcTime = date.getTime();
  const userTime = new Date(utcTime + (offsetHours * 60 * 60 * 1000));
  
  return userTime;
};

/**
 * Format a date/time string based on user's timezone
 * @param {Date|string} utcDate - The UTC date
 * @param {string} userTimezone - The user's timezone string
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} - Formatted date string
 */
export const formatDateInTimezone = (utcDate, userTimezone, options = {}) => {
  if (!utcDate) return '';
  
  const date = new Date(utcDate);
  if (isNaN(date.getTime())) return '';

  const offsetHours = parseTimezoneOffset(userTimezone);
  
  // Get UTC time in milliseconds
  const utcTime = date.getTime();
  
  // Convert offset hours to milliseconds
  const offsetMs = offsetHours * 60 * 60 * 1000;
  
  // Create a new date with the offset applied
  // This gives us the time in the user's timezone
  const userLocalTime = new Date(utcTime + offsetMs);
  
  // Now format this date, treating it as if it were UTC
  // We'll extract components and format them
  const year = userLocalTime.getUTCFullYear();
  const month = userLocalTime.getUTCMonth();
  const day = userLocalTime.getUTCDate();
  const hours = userLocalTime.getUTCHours();
  const minutes = userLocalTime.getUTCMinutes();
  const seconds = userLocalTime.getUTCSeconds();
  const ms = userLocalTime.getUTCMilliseconds();
  
  // Create a date using UTC constructor with user's local time values
  const formattedDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds, ms));
  
  const defaultOptions = {
    timeZone: 'UTC', // Use UTC since we've already converted
    hour: 'numeric',
    minute: '2-digit',
    ...options
  };
  
  return formattedDate.toLocaleString('en-US', defaultOptions);
};

/**
 * Format time for chat messages (e.g., "2:30 PM")
 * @param {Date|string} utcDate - The UTC date
 * @param {string} userTimezone - The user's timezone string
 * @returns {string} - Formatted time string
 */
export const formatMessageTime = (utcDate, userTimezone) => {
  return formatDateInTimezone(utcDate, userTimezone, {
    hour: 'numeric',
    minute: '2-digit'
  });
};

/**
 * Format relative time (e.g., "2h ago", "Just now")
 * @param {Date|string} utcDate - The UTC date
 * @param {string} userTimezone - The user's timezone string
 * @returns {string} - Relative time string
 */
export const formatRelativeTime = (utcDate, userTimezone) => {
  if (!utcDate) return '';
  
  const userDate = convertToUserTimezone(utcDate, userTimezone);
  if (!userDate) return '';

  // Use current time in user's timezone for comparison
  const now = new Date();
  const userNow = convertToUserTimezone(now.toISOString(), userTimezone);
  
  const diffMs = userNow.getTime() - userDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  // For older dates, show actual date
  return formatDateInTimezone(utcDate, userTimezone, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

/**
 * Format full date and time for sessions/requests
 * @param {Date|string} utcDate - The UTC date
 * @param {string} userTimezone - The user's timezone string
 * @returns {string} - Formatted date/time string
 */
export const formatFullDateTime = (utcDate, userTimezone) => {
  return formatDateInTimezone(utcDate, userTimezone, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

/**
 * Format date only (for member since, etc.)
 * @param {Date|string} utcDate - The UTC date
 * @param {string} userTimezone - The user's timezone string
 * @returns {string} - Formatted date string
 */
export const formatDateOnly = (utcDate, userTimezone, options = {}) => {
  return formatDateInTimezone(utcDate, userTimezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  });
};

/**
 * Clean timezone string - removes brackets and timezone names for consistency
 * @param {string} timezoneString - Original timezone string
 * @returns {string} - Cleaned timezone string (e.g., "GMT+05:30")
 */
export const cleanTimezoneString = (timezoneString) => {
  if (!timezoneString || timezoneString === 'Not set') {
    return timezoneString;
  }
  
  // Extract just the GMT offset part, removing brackets and timezone names
  const match = timezoneString.match(/GMT([+-]\d{1,2}:\d{2})/);
  if (match) {
    return `GMT${match[1]}`;
  }
  
  return timezoneString;
};

/**
 * Normalize timezone list - remove brackets and timezone names
 * @param {Array<string>} timezones - Array of timezone strings
 * @returns {Array<string>} - Cleaned array of timezone strings
 */
export const normalizeTimezoneList = (timezones) => {
  return timezones.map(cleanTimezoneString);
};

