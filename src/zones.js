// Time zones, with the Intl API of the JavaScript engine and nothing else: the tool carries no copy of the time zone
// database. This is the only file that uses Intl.DateTimeFormat, and it always passes a time zone and a moment, because
// ECMA-402 reads the time zone of the machine when none is given and the clock when no moment is given.
//
// A name is checked in three steps and refused at the first that fails (docs/method.md):
//   1. it is written as a time zone name: letters, digits, _, + and -, parts joined by /, starting with a letter; a UTC
//      offset such as +01:00 is refused, because an offset never changes with the clocks;
//   2. Intl.DateTimeFormat accepts it (ECMA-402 throws a RangeError for a name it does not know);
//   3. the primary name it resolves to is in Intl.supportedValuesOf('timeZone') where the engine has that function, or
//      is UTC, which ECMA-402 makes a primary name.
//
// The UTC offset of a zone at a moment comes from formatToParts: the local date and time of the moment, read back as if
// it were UTC, minus the moment. For a range of days the offsets are read once a day and every change is narrowed down
// to the second, so a zone costs a few hundred calls however many people work in it.
//
// A local time is turned into a moment with one rule, written in docs/method.md: a local time that the clocks skip (the
// hour lost when they move forward) is read as the same time on the clock before the change, which lands that far after
// the gap; a local time that happens twice (the hour repeated when the clocks move back) is read as the first of the two.

import { DAY_MS } from './days.js';

export const ZONE_LIMITS = { maxName: 64 };

const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
const OFFSET = /^[-+\u2212]?\d{1,2}(?::?\d{2})?(?::?\d{2})?$/;
const MARGIN_MS = 7 * DAY_MS;

let supportedSet;
// The primary names the engine lists, or null where Intl.supportedValuesOf does not exist.
export function supportedZones() {
  if (supportedSet === undefined) supportedSet = typeof Intl.supportedValuesOf === 'function' ? new Set(Intl.supportedValuesOf('timeZone')) : null;
  return supportedSet;
}

const formatters = new Map();
function formatterOf(zone) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(zone, f);
  }
  return f;
}

// Checks a time zone name against the primary names the engine lists (null where it lists none). Returns
// { ok: true, primary } or { ok: false, reason }.
export function checkZone(name, supported = supportedZones()) {
  if (typeof name !== 'string' || name === '') return { ok: false, reason: 'must be a time zone name such as Europe/Berlin' };
  if (name.length > ZONE_LIMITS.maxName) return { ok: false, reason: `is longer than ${ZONE_LIMITS.maxName} characters; a time zone name is shorter` };
  if (OFFSET.test(name)) return { ok: false, reason: 'is a UTC offset, not a time zone name; an offset never changes with the clocks, so write the name of the zone, such as Europe/Berlin' };
  if (!ZONE_NAME.test(name)) return { ok: false, reason: 'is not written as a time zone name, such as Europe/Berlin or America/New_York' };
  let primary;
  try {
    primary = new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return { ok: false, reason: 'is not a time zone that the Intl API of this Node knows' };
  }
  if (supported && primary !== 'UTC' && !supported.has(primary)) return { ok: false, reason: `resolves to ${primary}, which Intl.supportedValuesOf('timeZone') does not list` };
  return { ok: true, primary };
}

// The UTC offset in milliseconds of a zone at a moment, read from Intl. The moment is taken to the whole second.
export function offsetFromIntl(zone, ms) {
  const t = ms - (((ms % 1000) + 1000) % 1000);
  const parts = formatterOf(zone).formatToParts(t);
  const v = {};
  for (const p of parts) if (p.type !== 'literal') v[p.type] = Number(p.value);
  const wall = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
  return wall - t;
}

// The offsets of one zone over a span of moments: the moments where the offset changes and the offset from each.
// Offsets are read once a day; a change between two readings is narrowed down to the second. Two changes within one
// day that undo each other are not seen (docs/limits.md).
export function zoneTimeline(zone, fromMs, toMs) {
  const starts = [-Infinity];
  const offsets = [offsetFromIntl(zone, fromMs)];
  let prevMs = fromMs;
  let prev = offsets[0];
  for (let ms = fromMs + DAY_MS; ms <= toMs + DAY_MS; ms += DAY_MS) {
    const o = offsetFromIntl(zone, ms);
    if (o !== prev) {
      let lo = prevMs;
      let hi = ms;
      while (hi - lo > 1000) {
        const mid = lo + Math.floor((hi - lo) / 1000 / 2) * 1000;
        if (offsetFromIntl(zone, mid) === prev) lo = mid;
        else hi = mid;
      }
      starts.push(hi);
      offsets.push(offsetFromIntl(zone, hi));
      prev = o;
    }
    prevMs = ms;
  }
  return { zone, fromMs, toMs: toMs + DAY_MS, starts, offsets };
}

function timelineOffset(t, ms) {
  if (ms < t.fromMs || ms > t.toMs) return offsetFromIntl(t.zone, ms);
  let lo = 0;
  let hi = t.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t.starts[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  return t.offsets[lo];
}

// A local time (written as milliseconds on the scale of UTC) turned into a moment with the offsets of offsetAt.
// Returns { utc, kind }: kind is 'normal', 'gap' for a local time the clocks skip, or 'repeated' for one they pass twice.
export function localToUtc(offsetAt, wall) {
  const before = offsetAt(wall - DAY_MS);
  const after = offsetAt(wall + DAY_MS);
  const valid = [...new Set([before, after])].map((o) => wall - o).filter((u) => offsetAt(u) === wall - u);
  if (valid.length === 2) return { utc: Math.min(...valid), kind: 'repeated' };
  if (valid.length === 1) return { utc: valid[0], kind: 'normal' };
  return { utc: wall - before, kind: 'gap' };
}

// The clock of a run: the timelines of the zones over the days of the data, with a margin on each side.
export function makeClock(zones, fromDay, toDay) {
  const fromMs = fromDay * DAY_MS - MARGIN_MS;
  const toMs = (toDay + 1) * DAY_MS + MARGIN_MS;
  const timelines = new Map();
  for (const z of zones) if (!timelines.has(z)) timelines.set(z, zoneTimeline(z, fromMs, toMs));
  const timeline = (zone) => {
    let t = timelines.get(zone);
    if (!t) {
      t = zoneTimeline(zone, fromMs, toMs);
      timelines.set(zone, t);
    }
    return t;
  };
  const offsetAt = (zone, ms) => timelineOffset(timeline(zone), ms);
  return {
    kind: 'actual',
    offsetAt,
    toUtc: (zone, wall) => localToUtc((ms) => offsetAt(zone, ms), wall)
  };
}

// The days of the range on which a zone moved its clocks: the offset at local noon of the day differs from the offset at
// local noon of the day before. Returns [{ day, before, after }].
export function clockChanges(clock, zone, fromDay, toDay) {
  const noon = (day) => clock.offsetAt(zone, clock.toUtc(zone, day * DAY_MS + DAY_MS / 2).utc);
  const out = [];
  let prev = noon(fromDay - 1);
  for (let day = fromDay; day <= toDay; day += 1) {
    const o = noon(day);
    if (o !== prev) out.push({ day, before: prev, after: o });
    prev = o;
  }
  return out;
}

// An offset as the reports show it: UTC+01:00, UTC-03:00, UTC+05:30.
export function formatOffset(ms) {
  const minutes = Math.round(ms / 60000);
  const sign = minutes < 0 ? '-' : '+';
  const a = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
