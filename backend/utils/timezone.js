// Profiles store timezones as UTC offsets such as "GMT+05:30".

// Offset in minutes east of UTC, or null when the string has no valid offset
const parseOffsetMinutes = (timeZone) => {
  const match = typeof timeZone === 'string' ? timeZone.match(/GMT([+-])(\d{1,2}):(\d{2})/) : null;
  if (!match) return null;
  const minutes = parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
  return match[1] === '+' ? minutes : -minutes;
};

// e.g. "Thu, Oct 8, 6:00 PM (GMT+05:30)" - falls back to UTC when no offset is set
const formatInTimezone = (date, timeZone) => {
  const offset = parseOffsetMinutes(timeZone);
  const shifted = new Date(new Date(date).getTime() + (offset || 0) * 60 * 1000);
  const text = shifted.toLocaleString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const label = offset === null ? 'UTC' : timeZone.match(/GMT[+-]\d{1,2}:\d{2}/)[0];
  return `${text} (${label})`;
};

module.exports = { parseOffsetMinutes, formatInTimezone };
