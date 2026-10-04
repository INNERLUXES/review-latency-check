import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, ZONE_LIMITS, checkZone, clockChanges, formatOffset, localToUtc, makeClock, offsetFromIntl, supportedZones, zoneTimeline } from '../src/index.js';
import { DAY0, changeDay } from './helpers.js';

const H = 3600000;
const M = 60000;

test('checkZone: IANA names, links and UTC are accepted, and the primary name is the one Intl resolves', () => {
  for (const name of ['Europe/Berlin', 'America/New_York', 'America/Sao_Paulo', 'Asia/Kolkata', 'Australia/Lord_Howe', 'America/Argentina/Buenos_Aires', 'UTC', 'Etc/UTC']) {
    const z = checkZone(name);
    assert.equal(z.ok, true, `${name}: ${z.reason}`);
    assert.equal(z.primary, new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone);
  }
  assert.equal(checkZone('Etc/UTC').primary, 'UTC');
  // Every primary name the check accepts is listed by Intl.supportedValuesOf, or is UTC.
  const listed = supportedZones();
  assert.ok(listed === null || listed.size > 300);
  if (listed) for (const name of ['Europe/Berlin', 'Asia/Kolkata', 'America/Argentina/Buenos_Aires']) assert.ok(listed.has(checkZone(name).primary), name);
});

test('checkZone: a primary name that Intl.supportedValuesOf does not list is refused; UTC is always accepted', () => {
  const only = new Set(['Europe/Berlin']);
  assert.equal(checkZone('Europe/Berlin', only).ok, true);
  const z = checkZone('America/New_York', only);
  assert.equal(z.ok, false);
  assert.match(z.reason, /resolves to America\/New_York, which Intl\.supportedValuesOf\('timeZone'\) does not list/);
  assert.equal(checkZone('UTC', only).ok, true, 'ECMA-402 makes UTC a primary name');
  assert.equal(checkZone('Etc/UTC', only).ok, true);
  assert.equal(checkZone('America/New_York', null).ok, true, 'where the engine has no list, Intl alone decides');
});

test('checkZone: an unknown name, a UTC offset and anything not written as a name are refused, fail closed', () => {
  const refused = (name, pattern) => {
    const z = checkZone(name);
    assert.equal(z.ok, false, String(name));
    assert.match(z.reason, pattern, String(name));
  };
  for (const name of ['Mars/Olympus_Mons', 'Europe/Atlantis', 'Etc/Unknown_Place']) refused(name, /not a time zone that the Intl API of this Node knows/);
  for (const name of ['+01:00', '-05:00', '+0530', '-3', `${String.fromCharCode(0x2212)}05:00`, '+01:00:00']) refused(name, /is a UTC offset, not a time zone name/);
  for (const name of ['Europe Berlin', 'Europe/Berlin/', '/Europe/Berlin', 'Europe//Berlin', '1Europe/Berlin', 'Europe/Berlin;rm', '../etc/passwd', 'Europe/Ber\nlin']) refused(name, /is not written as a time zone name/);
  refused('', /must be a time zone name/);
  refused(42, /must be a time zone name/);
  refused(`Europe/${'B'.repeat(ZONE_LIMITS.maxName)}`, /longer than 64 characters/);
});

test('offsetFromIntl: zones without clock changes keep one offset, with whole and half hours', () => {
  for (const ms of [DAY0 * DAY_MS, (DAY0 + 120) * DAY_MS + 5 * H]) {
    assert.equal(offsetFromIntl('UTC', ms), 0);
    assert.equal(offsetFromIntl('Asia/Kolkata', ms), 330 * M);
    assert.equal(offsetFromIntl('America/Sao_Paulo', ms), -180 * M);
  }
  // A moment that is not on a whole second is read at its second.
  assert.equal(offsetFromIntl('Asia/Kolkata', DAY0 * DAY_MS + 999), 330 * M);
});

test('zoneTimeline: a clock change is found to the second, between two readings a day apart', () => {
  const forward = changeDay('Europe/Berlin', DAY0, 1);
  assert.deepEqual([forward.before, forward.after], [60, 120]);
  const t = zoneTimeline('Europe/Berlin', (forward.day - 10) * DAY_MS, (forward.day + 10) * DAY_MS);
  assert.equal(t.starts.length, 2);
  const at = t.starts[1];
  assert.equal(offsetFromIntl('Europe/Berlin', at - 1000), 60 * M);
  assert.equal(offsetFromIntl('Europe/Berlin', at), 120 * M);
  assert.equal(Math.floor(at / DAY_MS), forward.day, 'the change is on the day changeDay found');
  assert.deepEqual(t.offsets, [60 * M, 120 * M]);
  const steady = zoneTimeline('Asia/Kolkata', DAY0 * DAY_MS, (DAY0 + 400) * DAY_MS);
  assert.deepEqual(steady.offsets, [330 * M]);
});

test('localToUtc: a local time the clocks skip is read on the clock before the change, so it lands later by the gap', () => {
  const forward = changeDay('Europe/Berlin', DAY0, 1);
  const clock = makeClock(['Europe/Berlin'], forward.day - 3, forward.day + 3);
  const t = zoneTimeline('Europe/Berlin', (forward.day - 3) * DAY_MS, (forward.day + 3) * DAY_MS).starts[1];
  const offsetAt = (ms) => clock.offsetAt('Europe/Berlin', ms);
  // The skipped local times run from t + 60 minutes to t + 120 minutes on the scale of local time.
  const skipped = t + 60 * M + 30 * M;
  const gap = localToUtc(offsetAt, skipped);
  assert.equal(gap.kind, 'gap');
  assert.equal(gap.utc, skipped - 60 * M);
  assert.equal(gap.utc + offsetAt(gap.utc), skipped + 60 * M, 'read as the same time on the clock before the change: an hour later on the new clock');
  // The first local time after the gap and the last one before it are normal.
  assert.deepEqual(localToUtc(offsetAt, t + 120 * M), { utc: t, kind: 'normal' });
  assert.deepEqual(localToUtc(offsetAt, t + 60 * M - M), { utc: t - M, kind: 'normal' });
  assert.equal(clock.toUtc('Europe/Berlin', skipped).kind, 'gap');
});

test('localToUtc: a local time the clocks pass twice is read as the first of the two', () => {
  const back = changeDay('Europe/Berlin', DAY0, -1);
  assert.deepEqual([back.before, back.after], [120, 60]);
  const t = zoneTimeline('Europe/Berlin', (back.day - 3) * DAY_MS, (back.day + 3) * DAY_MS).starts[1];
  const clock = makeClock(['Europe/Berlin'], back.day - 3, back.day + 3);
  const offsetAt = (ms) => clock.offsetAt('Europe/Berlin', ms);
  // The repeated local times run from t + 60 minutes to t + 120 minutes on the scale of local time.
  const twice = t + 60 * M + 30 * M;
  const r = localToUtc(offsetAt, twice);
  assert.equal(r.kind, 'repeated');
  assert.equal(r.utc, twice - 120 * M, 'the first: still on the offset before the change');
  assert.equal(r.utc + offsetAt(r.utc), twice);
  assert.equal(r.utc + 60 * M + offsetAt(r.utc + 60 * M), twice, 'an hour later the same local time comes again');
  assert.deepEqual(localToUtc(offsetAt, t + 120 * M), { utc: t + 60 * M, kind: 'normal' });
});

test('makeClock: offsets and the clock changes of a range', () => {
  const forward = changeDay('Europe/Berlin', DAY0, 1);
  const clock = makeClock(['Europe/Berlin', 'America/Sao_Paulo', 'Asia/Kolkata'], forward.day - 7, forward.day + 7);
  const after = (forward.day + 2) * DAY_MS;
  assert.equal(clock.offsetAt('Europe/Berlin', after), 120 * M);
  assert.equal(clock.offsetAt('Europe/Berlin', (forward.day - 2) * DAY_MS), 60 * M);
  assert.equal(clock.offsetAt('America/Sao_Paulo', after), -180 * M);
  assert.deepEqual(clockChanges(clock, 'Europe/Berlin', forward.day - 7, forward.day + 7), [{ day: forward.day, before: 60 * M, after: 120 * M }]);
  assert.deepEqual(clockChanges(clock, 'America/Sao_Paulo', forward.day - 7, forward.day + 7), []);
  // A zone the clock was not built with is read on demand.
  assert.equal(clock.offsetAt('UTC', after), 0);
  // A moment far outside the range is read from Intl directly.
  assert.equal(clock.offsetAt('Asia/Kolkata', (forward.day + 5000) * DAY_MS), 330 * M);
});

test('formatOffset: UTC with a sign, hours and minutes', () => {
  assert.equal(formatOffset(0), 'UTC+00:00');
  assert.equal(formatOffset(60 * M), 'UTC+01:00');
  assert.equal(formatOffset(-180 * M), 'UTC-03:00');
  assert.equal(formatOffset(330 * M), 'UTC+05:30');
  assert.equal(formatOffset(-570 * M), 'UTC-09:30');
  assert.equal(formatOffset(765 * M), 'UTC+12:45');
});
