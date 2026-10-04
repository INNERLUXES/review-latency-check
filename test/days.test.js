import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_LIMITS, DAY_MS, LABEL_KINDS, MONTH_NAMES, civilOf, clockOf, dateOfDay, dayLabel, dayOfDate, durationText, minutesOfMs, parseTimestamp, timeLabel, weekdayKey, weekdayName, weekdayOf } from '../src/index.js';
import { DAY0, at, isoDay, ms } from './helpers.js';

// Dates and timestamps are built at run time from day numbers, so this file holds no date.
const Y = () => isoDay(DAY0).slice(0, 4);

test('civilOf, dateOfDay and dayOfDate: a day number and its date go both ways, without a Date object', () => {
  for (const day of [0, 1, 59, 60, DAY0, DAY0 + 59, DAY0 + 365, DAY0 + 366, DAY0 + 1461, DAY_LIMITS.maxDay]) assert.equal(dayOfDate(dateOfDay(day)), day, dateOfDay(day));
  assert.equal(dateOfDay(0), `${['19', '70'].join('')}-01-01`);
  assert.deepEqual(civilOf(0), { year: Number(['19', '70'].join('')), month: 1, day: 1 });
  for (let d = DAY0 - 400; d < DAY0 + 400; d += 1) {
    const c = civilOf(d);
    assert.equal(Date.UTC(c.year, c.month - 1, c.day) / DAY_MS, d);
  }
});

test('dayOfDate: a day that is not in the calendar, before the epoch, or in another form is refused', () => {
  const y = Y();
  for (const bad of [`${y}-02-30`, `${y}-13-01`, `${y}-00-10`, `${y}-04-31`, `${y}-1-01`, `${y}/01/01`, `01-01-${y}`, ` ${y}-01-01`, 'today', '', dateOfDay(-1)]) assert.equal(dayOfDate(bad), null, bad);
});

test('weekdays: day 0 of the epoch was a Thursday, and DAY0 is a Monday', () => {
  assert.equal(weekdayOf(0), 4);
  assert.equal(weekdayKey(DAY0), 'mon');
  assert.equal(weekdayName(DAY0 + 6), 'Sun');
  assert.equal(weekdayOf(-1), 3);
});

test('parseTimestamp: the RFC 3339 date-time GitHub writes, with a fraction or an offset', () => {
  assert.equal(parseTimestamp(at(0, '14:05')), ms(0, '14:05'));
  assert.equal(parseTimestamp(`${isoDay(DAY0)}T14:05:30Z`), ms(0, '14:05') + 30000);
  assert.equal(parseTimestamp(`${isoDay(DAY0)}T14:05:30.5Z`), ms(0, '14:05') + 30500);
  assert.equal(parseTimestamp(`${isoDay(DAY0)}T14:05:30.123456789Z`), ms(0, '14:05') + 30123, 'a fraction finer than a millisecond is cut off');
  assert.equal(parseTimestamp(`${isoDay(DAY0)}T15:05:00+01:00`), ms(0, '14:05'));
  assert.equal(parseTimestamp(`${isoDay(DAY0)}T09:35:00-04:30`), ms(0, '14:05'));
  assert.equal(parseTimestamp(`${isoDay(DAY0)}T00:30:00+01:00`), ms(-1, '23:30'), 'an offset can move the moment to the day before');
});

test('parseTimestamp: anything else is refused, so a wrong moment is never read', () => {
  const d = isoDay(DAY0);
  for (const bad of [`${d}T14:05Z`, `${d} 14:05:00Z`, `${d}t14:05:00z`, `${d}T14:05:00`, `${d}T24:00:00Z`, `${d}T14:60:00Z`, `${d}T23:59:60Z`, `${d}T14:05:00+24:00`, `${d}T14:05:00+01:60`, `${d}T14:05:00+0100`, `${Y()}-02-30T10:00:00Z`, `${d}T14:05:00.Z`, d, '', ' ', 42, null, undefined, {}, `${dateOfDay(-1)}T23:00:00Z`]) {
    assert.equal(parseTimestamp(bad), null, String(bad));
  }
});

test('labels: date (no year), offset from the first day, or a full timestamp; the end of a moment is cut to the minute', () => {
  assert.deepEqual(LABEL_KINDS, ['date', 'offset', 'iso']);
  const t = ms(3, '14:05') + 59999;
  const c = civilOf(DAY0 + 3);
  assert.equal(timeLabel(t, 'date'), `Thu ${String(c.day).padStart(2, '0')} ${MONTH_NAMES[c.month - 1]} 14:05Z`);
  assert.doesNotMatch(timeLabel(t, 'date'), new RegExp(Y()), 'a date label holds no year');
  assert.equal(timeLabel(t, 'offset', DAY0), 'day 3 (Thu) 14:05Z');
  assert.equal(timeLabel(ms(-2, '08:00'), 'offset', DAY0), 'day -2 (Sat) 08:00Z');
  assert.equal(timeLabel(t, 'iso'), `${isoDay(DAY0 + 3)}T14:05:59Z`);
  assert.equal(dayLabel(DAY0 + 6, 'offset', DAY0), 'day 6 (Sun)');
  assert.equal(dayLabel(DAY0 + 6, 'iso'), `${isoDay(DAY0 + 6)} (Sun)`);
  assert.match(dayLabel(DAY0 + 6, 'date'), /^Sun \d{2} [A-Z][a-z]{2}$/);
  assert.equal(clockOf(ms(0, '00:00')), '00:00');
  assert.equal(clockOf(ms(0, '23:59') + 59999), '23:59');
});

test('durations: whole minutes, rounded down, as hours and minutes', () => {
  assert.equal(durationText(0), '0h 00m');
  assert.equal(durationText(59999), '0h 00m');
  assert.equal(durationText(5 * 60000), '0h 05m');
  assert.equal(durationText((26 * 60 + 40) * 60000 + 30000), '26h 40m');
  assert.equal(minutesOfMs(90 * 60000 + 59999), 90);
});
