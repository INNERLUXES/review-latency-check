// Days, moments and their labels. The tool reads no clock: every moment comes from a timestamp of the input, or from
// --as-of. A timestamp is read with one strict pattern of RFC 3339 and turned into milliseconds of UTC with Date.UTC,
// which does not depend on the time zone or the locale of the machine. A moment is written back by plain arithmetic on
// the day number, so no Date object is ever made and no label depends on the machine either.
//
// Labels hold no year by default (docs/decisions/0001): a moment is shown as "Mon 02 Mar 14:05Z" with --time-labels
// date, as "day 3 (Thu) 14:05Z" with --time-labels offset, counted from the UTC day of the first pull, and as a full
// RFC 3339 timestamp only with --time-labels iso.

import { WEEKDAYS, WEEKDAY_NAMES, MONTH_NAMES } from './data.js';

export const DAY_MS = 86400000;
export const MINUTE_MS = 60000;

// The last day number the tool reads: the last day of the four-digit years.
export const DAY_LIMITS = { maxDay: 2932896 };

// The day of the week of a day number: 0 is Sunday. Day 0 of the epoch was a Thursday.
export const weekdayOf = (day) => (((day + 4) % 7) + 7) % 7;
export const weekdayKey = (day) => WEEKDAYS[weekdayOf(day)];
export const weekdayName = (day) => WEEKDAY_NAMES[weekdayOf(day)];

// The civil date of a day number, by the days-from-civil algorithm run backwards: { year, month (1-12), day }.
export function civilOf(dayNumber) {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

const pad = (n, width = 2) => String(n).padStart(width, '0');

// The date YYYY-MM-DD of a day number.
export function dateOfDay(dayNumber) {
  const c = civilOf(dayNumber);
  return `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)}`;
}

// The day number of a date YYYY-MM-DD, or null when it is not a real date or lies before the epoch.
export function dayOfDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const day = Date.UTC(y, mo - 1, d) / DAY_MS;
  const back = civilOf(day);
  if (back.year !== y || back.month !== mo || back.day !== d || day < 0) return null;
  return day;
}

// The timestamps the tool reads: the date-time of RFC 3339 section 5.6 with an upper-case T and Z, a fraction of a second
// of 1 to 9 digits, and an offset Z or +HH:MM / -HH:MM. GitHub returns its timestamps in UTC, written with Z (FACTS
// ghTimestampsUtc); an offset is read too, so a file written by another tool is not misread. A leap second (60) is
// refused.
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

// Milliseconds of UTC of a timestamp, or null when it is not one. A fraction finer than a millisecond is cut off.
export function parseTimestamp(text) {
  if (typeof text !== 'string') return null;
  const m = TIMESTAMP.exec(text);
  if (!m) return null;
  const day = dayOfDate(`${m[1]}-${m[2]}-${m[3]}`);
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6])];
  if (day === null || h > 23 || mi > 59 || s > 59) return null;
  let offset = 0;
  if (m[8] !== 'Z') {
    const oh = Number(m[8].slice(1, 3));
    const om = Number(m[8].slice(4, 6));
    if (oh > 23 || om > 59) return null;
    offset = (m[8][0] === '-' ? -1 : 1) * (oh * 60 + om) * MINUTE_MS;
  }
  const ms = m[7] ? Number(m[7].padEnd(3, '0').slice(0, 3)) : 0;
  const t = day * DAY_MS + h * 3600000 + mi * MINUTE_MS + s * 1000 + ms - offset;
  return t < 0 || t >= (DAY_LIMITS.maxDay + 1) * DAY_MS ? null : t;
}

// HH:MM of a moment in UTC, to the minute, rounded down.
export function clockOf(ms) {
  const day = Math.floor(ms / DAY_MS);
  const minutes = Math.floor((ms - day * DAY_MS) / MINUTE_MS);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export const LABEL_KINDS = ['date', 'offset', 'iso'];

// A moment as the reports show it. origin is the day number of day 0 for --time-labels offset.
export function timeLabel(ms, kind = 'date', origin = 0) {
  const day = Math.floor(ms / DAY_MS);
  if (kind === 'iso') {
    const rest = ms - day * DAY_MS;
    const s = Math.floor(rest / 1000) % 60;
    return `${dateOfDay(day)}T${clockOf(ms)}:${pad(s)}Z`;
  }
  if (kind === 'offset') return `day ${day - origin} (${weekdayName(day)}) ${clockOf(ms)}Z`;
  const c = civilOf(day);
  return `${weekdayName(day)} ${pad(c.day)} ${MONTH_NAMES[c.month - 1]} ${clockOf(ms)}Z`;
}

// A day as the reports show it, with no time of day: "Sun 08 Mar", "day 6 (Sun)" or YYYY-MM-DD (Sun).
export function dayLabel(day, kind = 'date', origin = 0) {
  if (kind === 'iso') return `${dateOfDay(day)} (${weekdayName(day)})`;
  if (kind === 'offset') return `day ${day - origin} (${weekdayName(day)})`;
  const c = civilOf(day);
  return `${weekdayName(day)} ${pad(c.day)} ${MONTH_NAMES[c.month - 1]}`;
}

// A length of time in whole minutes, rounded down, as the text report writes it: 0h 05m, 26h 40m.
export function durationText(ms) {
  const minutes = Math.floor(ms / MINUTE_MS);
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

// Whole minutes of a length of time, rounded down, as the JSON report writes it.
export const minutesOfMs = (ms) => Math.floor(ms / MINUTE_MS);
