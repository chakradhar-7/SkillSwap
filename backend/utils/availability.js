const { parseOffsetMinutes } = require('./timezone');

const MINUTES_PER_DAY = 1440;
// "Flexible" availability is treated as 9 AM - 9 PM in the teacher's timezone
const FLEXIBLE_RANGE = { start: 9 * 60, end: 21 * 60 };

// "9:00 AM", "9 AM", "21:30" -> minutes after midnight, or null
const parseTimeToMinutes = (value) => {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/) || cleaned.match(/^(\d{1,2})()\s*(AM|PM)$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3];
  if (minutes > 59) return null;
  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
};

// Parses the stored time-slot string ("9:00 AM - 12:00 PM, 6:00 PM - 9:00 PM",
// or the older "Morning (9AM-12PM)" style) into minute ranges. An end before
// the start means the range runs past midnight.
const parseTimeSlots = (format) => {
  if (typeof format !== 'string' || !format.trim() || format === 'Not set') return [];

  const ranges = [];
  format.split(',').map((part) => part.trim()).filter(Boolean).forEach((part) => {
    if (/flexible/i.test(part)) {
      ranges.push({ ...FLEXIBLE_RANGE });
      return;
    }

    const legacy = part.match(/\((\d{1,2})\s*(AM|PM)?\s*-\s*(\d{1,2})\s*(AM|PM)?\)/i);
    if (legacy) {
      const start = parseTimeToMinutes(`${legacy[1]} ${legacy[2] || legacy[4] || 'AM'}`);
      const end = parseTimeToMinutes(`${legacy[3]} ${legacy[4] || legacy[2] || 'AM'}`);
      if (start !== null && end !== null) ranges.push({ start, end });
      return;
    }

    const range = part.match(/^(.+?)\s*-\s*(.+)$/);
    if (range) {
      const start = parseTimeToMinutes(range[1]);
      const end = parseTimeToMinutes(range[2]);
      if (start !== null && end !== null && start !== end) ranges.push({ start, end });
    }
  });
  return ranges;
};

// Weekdays (0 = Sunday) allowed by the "preferred days" setting
const allowedWeekdays = (preferredDays) => {
  const value = (preferredDays || '').toLowerCase();
  if (value.startsWith('weekdays')) return [1, 2, 3, 4, 5];
  if (value.startsWith('weekends')) return [0, 6];
  return [0, 1, 2, 3, 4, 5, 6];
};

/**
 * Lists bookable slots from a teacher's availability.
 * @param {object} options
 * @param {object} options.availability  { preferredDays, timeZone, format } from the teacher's profile
 * @param {Array<{start: number, end: number}>} options.busy  Busy intervals in epoch ms
 * @param {number} options.durationMinutes  Length of the session to book
 * @param {Date} [options.now]
 * @param {number} [options.days]  How many days ahead to look (from today in the teacher's timezone)
 * @param {number} [options.stepMinutes]  Spacing between slot start times
 * @param {number} [options.leadMinutes]  Minimum notice before a slot can start
 * @returns {Array<{start: string, end: string}>} UTC ISO strings, sorted
 */
const computeAvailableSlots = ({
  availability,
  busy = [],
  durationMinutes,
  now = new Date(),
  days = 14,
  stepMinutes = 30,
  leadMinutes = 60,
}) => {
  const ranges = parseTimeSlots(availability?.format);
  if (ranges.length === 0) return [];

  const offsetMs = (parseOffsetMinutes(availability?.timeZone) || 0) * 60 * 1000;
  const weekdays = allowedWeekdays(availability?.preferredDays);
  const earliest = now.getTime() + leadMinutes * 60 * 1000;
  const localNow = new Date(now.getTime() + offsetMs);
  const slots = new Map();

  for (let day = 0; day < days; day++) {
    // Midnight of this day on the teacher's wall clock, as if it were UTC
    const localMidnight = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + day);
    if (!weekdays.includes(new Date(localMidnight).getUTCDay())) continue;

    ranges.forEach(({ start, end }) => {
      const rangeEnd = end <= start ? end + MINUTES_PER_DAY : end;
      for (let minute = start; minute + durationMinutes <= rangeEnd; minute += stepMinutes) {
        const slotStart = localMidnight + minute * 60 * 1000 - offsetMs;
        const slotEnd = slotStart + durationMinutes * 60 * 1000;
        if (slotStart < earliest) continue;
        if (busy.some((b) => slotStart < b.end && slotEnd > b.start)) continue;
        slots.set(slotStart, { start: new Date(slotStart).toISOString(), end: new Date(slotEnd).toISOString() });
      }
    });
  }

  return [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([, slot]) => slot);
};

module.exports = { parseTimeToMinutes, parseTimeSlots, allowedWeekdays, computeAvailableSlots };
