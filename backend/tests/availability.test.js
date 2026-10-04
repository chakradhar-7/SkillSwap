const test = require('node:test');
const assert = require('node:assert');
const { parseTimeSlots, computeAvailableSlots } = require('../utils/availability');
const { formatInTimezone, parseOffsetMinutes } = require('../utils/timezone');
const { hashToken, createToken, isIssuedBeforePasswordChange } = require('../utils/tokens');

// Wednesday 2026-10-07 10:00 UTC
const NOW = new Date('2026-10-07T10:00:00Z');

test('parses current and legacy time-slot formats', () => {
  assert.deepStrictEqual(parseTimeSlots('9:00 AM - 12:00 PM, 6:00 PM - 9:00 PM'), [
    { start: 540, end: 720 },
    { start: 1080, end: 1260 },
  ]);
  assert.deepStrictEqual(parseTimeSlots('Evening (6PM-9PM)'), [{ start: 1080, end: 1260 }]);
  assert.deepStrictEqual(parseTimeSlots('11:00 PM - 1:00 AM'), [{ start: 1380, end: 60 }]);
  assert.deepStrictEqual(parseTimeSlots('Flexible'), [{ start: 540, end: 1260 }]);
  assert.deepStrictEqual(parseTimeSlots('Not set'), []);
  assert.deepStrictEqual(parseTimeSlots('nonsense'), []);
});

test('slots are generated in the teacher timezone and returned in UTC', () => {
  const slots = computeAvailableSlots({
    availability: { preferredDays: 'Flexible', timeZone: 'GMT+05:30', format: '6:00 PM - 8:00 PM' },
    durationMinutes: 60,
    now: NOW,
    days: 1,
  });
  // Today 18:00-20:00 IST = 12:30-14:30 UTC -> starts at 12:30, 13:00, 13:30
  assert.deepStrictEqual(slots.map((s) => s.start), [
    '2026-10-07T12:30:00.000Z',
    '2026-10-07T13:00:00.000Z',
    '2026-10-07T13:30:00.000Z',
  ]);
});

test('respects preferred days, minimum notice and busy times', () => {
  const availability = { preferredDays: 'Weekends only', timeZone: 'GMT+00:00', format: '10:00 AM - 12:00 PM' };
  const slots = computeAvailableSlots({ availability, durationMinutes: 60, now: NOW, days: 7 });
  const days = new Set(slots.map((s) => new Date(s.start).getUTCDay()));
  assert.deepStrictEqual([...days].sort(), [0, 6], 'only Saturday and Sunday');

  const busy = [{ start: Date.parse('2026-10-10T10:30:00Z'), end: Date.parse('2026-10-10T11:30:00Z') }];
  const saturday = computeAvailableSlots({ availability, busy, durationMinutes: 60, now: NOW, days: 4 });
  assert.deepStrictEqual(saturday.map((s) => s.start), [], 'every Saturday slot overlaps the busy hour');

  const noLead = computeAvailableSlots({
    availability: { preferredDays: 'Flexible', timeZone: 'GMT+00:00', format: '10:00 AM - 12:00 PM' },
    durationMinutes: 30,
    now: NOW,
    days: 1,
  });
  // 10:00 now + 60 min notice -> first slot 11:00
  assert.strictEqual(noLead[0].start, '2026-10-07T11:00:00.000Z');
});

test('ranges that cross midnight continue into the next day', () => {
  const slots = computeAvailableSlots({
    availability: { preferredDays: 'Flexible', timeZone: 'GMT+00:00', format: '11:00 PM - 1:00 AM' },
    durationMinutes: 120,
    now: NOW,
    days: 1,
  });
  assert.deepStrictEqual(slots, [{ start: '2026-10-07T23:00:00.000Z', end: '2026-10-08T01:00:00.000Z' }]);
});

test('formats times in the user timezone', () => {
  assert.strictEqual(parseOffsetMinutes('GMT-03:30'), -210);
  assert.strictEqual(parseOffsetMinutes('Not set'), null);
  assert.strictEqual(formatInTimezone('2026-10-08T12:30:00Z', 'GMT+05:30'), 'Thu, Oct 8, 6:00 PM (GMT+05:30)');
  assert.strictEqual(formatInTimezone('2026-10-08T12:30:00Z', 'Not set'), 'Thu, Oct 8, 12:30 PM (UTC)');
});

test('email-link tokens and password-change checks', () => {
  const token = createToken();
  assert.strictEqual(token.length, 64);
  assert.notStrictEqual(hashToken(token), token);
  assert.strictEqual(hashToken(token), hashToken(token));

  const changedAt = new Date('2026-10-07T10:00:00Z');
  const user = { passwordChangedAt: changedAt };
  assert.strictEqual(isIssuedBeforePasswordChange({ iat: changedAt.getTime() / 1000 - 60 }, user), true);
  assert.strictEqual(isIssuedBeforePasswordChange({ iat: changedAt.getTime() / 1000 + 5 }, user), false);
  assert.strictEqual(isIssuedBeforePasswordChange({ iat: 1 }, {}), false);
});
