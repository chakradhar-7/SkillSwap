const test = require('node:test');
const assert = require('node:assert');
const { generateSessionDates, validateScheduleInput } = require('../utils/schedule');
const escapeRegex = require('../utils/escapeRegex');

// Wednesday 2026-10-07 10:00 UTC
const NOW = new Date('2026-10-07T10:00:00Z');

test('interprets time of day in the user timezone (GMT+05:30)', () => {
  const dates = generateSessionDates({
    numberOfWeeks: 1,
    daysOfWeek: ['Thursday'],
    timeOfDay: '18:00',
    utcOffsetMinutes: 330,
    now: NOW,
  });
  // 18:00 IST on Thursday 2026-10-08 is 12:30 UTC
  assert.deepStrictEqual(dates.map((d) => d.toISOString()), ['2026-10-08T12:30:00.000Z']);
});

test('uses the nearest upcoming occurrence of every selected day', () => {
  const dates = generateSessionDates({
    numberOfWeeks: 2,
    daysOfWeek: ['Monday', 'Friday'],
    timeOfDay: '09:00',
    utcOffsetMinutes: 0,
    now: NOW,
  });
  assert.deepStrictEqual(dates.map((d) => d.toISOString()), [
    '2026-10-09T09:00:00.000Z', // Friday this week is not skipped
    '2026-10-12T09:00:00.000Z',
    '2026-10-16T09:00:00.000Z',
    '2026-10-19T09:00:00.000Z',
  ]);
});

test('skips today when the slot has already passed', () => {
  const dates = generateSessionDates({
    numberOfWeeks: 1,
    daysOfWeek: ['Wednesday'],
    timeOfDay: '08:00',
    utcOffsetMinutes: 0,
    now: NOW,
  });
  assert.deepStrictEqual(dates.map((d) => d.toISOString()), ['2026-10-14T08:00:00.000Z']);
});

test('includes today when the slot is still ahead', () => {
  const dates = generateSessionDates({
    numberOfWeeks: 1,
    daysOfWeek: ['Wednesday'],
    timeOfDay: '15:00',
    utcOffsetMinutes: 0,
    now: NOW,
  });
  assert.deepStrictEqual(dates.map((d) => d.toISOString()), ['2026-10-07T15:00:00.000Z']);
});

test('handles negative offsets that cross the date line', () => {
  // 22:00 on Wednesday in GMT-08:00 is 06:00 UTC Thursday
  const dates = generateSessionDates({
    numberOfWeeks: 1,
    daysOfWeek: ['Wednesday'],
    timeOfDay: '22:00',
    utcOffsetMinutes: -480,
    now: NOW,
  });
  assert.deepStrictEqual(dates.map((d) => d.toISOString()), ['2026-10-08T06:00:00.000Z']);
});

test('validateScheduleInput rejects bad input', () => {
  const valid = { numberOfWeeks: 2, daysOfWeek: ['Monday'], timeOfDay: '09:30', durationHours: 1 };
  assert.strictEqual(validateScheduleInput(valid), null);
  assert.ok(validateScheduleInput({ ...valid, numberOfWeeks: 0 }));
  assert.ok(validateScheduleInput({ ...valid, numberOfWeeks: 13 }));
  assert.ok(validateScheduleInput({ ...valid, daysOfWeek: ['Funday'] }));
  assert.ok(validateScheduleInput({ ...valid, timeOfDay: '25:00' }));
  assert.ok(validateScheduleInput({ ...valid, durationHours: 0 }));
  assert.ok(validateScheduleInput({ ...valid, utcOffsetMinutes: 99999 }));
});

test('escapeRegex neutralises special characters', () => {
  const pattern = new RegExp(escapeRegex('C++ (advanced)'), 'i');
  assert.ok(pattern.test('c++ (Advanced)'));
  assert.doesNotThrow(() => new RegExp(escapeRegex('[unclosed(')));
});
