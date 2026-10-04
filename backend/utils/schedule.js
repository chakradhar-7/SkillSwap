const DAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Validates the recurring-schedule payload sent when a teacher accepts a request.
// Returns an error message, or null when the input is valid.
const validateScheduleInput = ({ numberOfWeeks, daysOfWeek, timeOfDay, durationHours, utcOffsetMinutes }) => {
  const weeks = Number(numberOfWeeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) {
    return 'Number of weeks must be a whole number between 1 and 12';
  }
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0 || daysOfWeek.some((d) => !(d in DAY_INDEX))) {
    return 'Please select at least one valid day of the week';
  }
  if (typeof timeOfDay !== 'string' || !TIME_OF_DAY_PATTERN.test(timeOfDay)) {
    return 'Time of day must be in HH:mm format';
  }
  const duration = Number(durationHours);
  if (!Number.isFinite(duration) || duration < 0.5 || duration > 8) {
    return 'Duration must be between 0.5 and 8 hours';
  }
  if (utcOffsetMinutes !== undefined && utcOffsetMinutes !== null) {
    const offset = Number(utcOffsetMinutes);
    if (!Number.isFinite(offset) || offset < -14 * 60 || offset > 14 * 60) {
      return 'Invalid timezone offset';
    }
  }
  return null;
};

// Generates the next `numberOfWeeks` occurrences of each selected weekday at
// `timeOfDay`, where the day and time are interpreted in the user's timezone
// (`utcOffsetMinutes`, positive east of UTC, e.g. 330 for GMT+05:30).
// Only future dates are returned, sorted chronologically.
const generateSessionDates = ({ numberOfWeeks, daysOfWeek, timeOfDay, utcOffsetMinutes = 0, now = new Date() }) => {
  const weeks = Number(numberOfWeeks);
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const offsetMs = Number(utcOffsetMinutes) * 60 * 1000;
  const selectedDays = [...new Set(daysOfWeek.map((d) => DAY_INDEX[d]))].filter((d) => d !== undefined);

  // The user's wall-clock "now", read through the UTC getters.
  const localNow = new Date(now.getTime() + offsetMs);
  const countsByDay = new Map(selectedDays.map((d) => [d, 0]));
  const target = selectedDays.length * weeks;
  const dates = [];

  // One extra week covers the case where today's slot has already passed.
  for (let i = 0; i < (weeks + 1) * 7 && dates.length < target; i++) {
    const localSlot = new Date(Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate() + i,
      hours,
      minutes
    ));
    const dayOfWeek = localSlot.getUTCDay();
    if (!countsByDay.has(dayOfWeek) || countsByDay.get(dayOfWeek) >= weeks) continue;

    const actual = new Date(localSlot.getTime() - offsetMs);
    if (actual <= now) continue;

    countsByDay.set(dayOfWeek, countsByDay.get(dayOfWeek) + 1);
    dates.push(actual);
  }

  return dates;
};

module.exports = { DAY_INDEX, validateScheduleInput, generateSessionDates };
