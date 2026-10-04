// The team file: the people whose reviews are measured, each with a GitHub login, an IANA time zone, working hours by
// day of the week in local time, and days off. The working hours decide the "working" numbers of the report: a wait is
// counted only while the person who ended it was at work, in their own zone. Every key the tool does not know is an
// error, so a typo such as hour cannot silently change a number. The file is read with the strict JSON reader of
// src/json.js, which refuses an object that names a key twice. People are named by login only; the file has no field for
// a name or an email address.

import { WEEKDAYS } from './data.js';
import { dayOfDate } from './days.js';
import { checkZone } from './zones.js';
import { isLogin, loginKey } from './logins.js';
import { safeText } from './text.js';
import { CONTROL, ConfigError, collector, isObject, kindOf, readStrictJson, unknownKey } from './strict.js';

export const TEAM_LIMITS = { maxPeople: 200, maxShifts: 6, maxDaysOff: 1000, maxName: 120 };

// The keys of the team file, and of one person in the people list.
export const TEAM_KEYS = { name: 'string', people: 'people' };
export const PERSON_KEYS = { login: 'login', zone: 'zone', hours: 'hours', daysOff: 'days' };

const SHIFT = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-4]):([0-5]\d)$/;

// HH:MM written back from minutes after midnight.
export const clockText = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// The days of the week of a key such as mon or mon-fri, as indexes from Sunday, or null. A range runs forward within
// one week from Monday to Sunday, so fri-mon is refused rather than read as a wrap.
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export function readWeekdays(key) {
  const [a, b, ...rest] = String(key).split('-');
  if (rest.length) return null;
  const i = ORDER.indexOf(a);
  if (i < 0) return null;
  if (b === undefined) return [WEEKDAYS.indexOf(a)];
  const j = ORDER.indexOf(b);
  if (j <= i) return null;
  return ORDER.slice(i, j + 1).map((d) => WEEKDAYS.indexOf(d));
}

// The weekly hours of a person as one line: runs of days with the same shifts, such as mon-fri 09:00-12:00, 13:00-17:30.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export function hoursText(week) {
  const parts = [];
  let i = 0;
  while (i < 7) {
    const shifts = week[WEEK_ORDER[i]];
    let j = i;
    while (j + 1 < 7 && JSON.stringify(week[WEEK_ORDER[j + 1]]) === JSON.stringify(shifts)) j += 1;
    if (shifts.length) parts.push(`${WEEKDAYS[WEEK_ORDER[i]]}${j > i ? `-${WEEKDAYS[WEEK_ORDER[j]]}` : ''} ${shifts.map(([a, b]) => `${clockText(a)}-${clockText(b)}`).join(', ')}`);
    i = j + 1;
  }
  return parts.join('; ');
}

// Checks the value of the team file and builds the normal form: { name, people: [{ login, key, zone, week, daysOff }] }.
export function validateTeam(value, lines = new Map(), file = 'team') {
  const { problems, bad, has } = collector(file, lines);
  const lim = TEAM_LIMITS;

  const list = (v, path, max, each, what) => {
    if (!Array.isArray(v)) return bad(path, `must be a list, not ${kindOf(v)}`);
    if (v.length === 0) return bad(path, `is an empty list; ${path === 'people' ? 'name one person at least' : 'leave the key out instead'}`);
    if (v.length > max) return bad(path, `holds more than ${max} ${what}`);
    const out = [];
    let ok = true;
    v.forEach((item, i) => {
      const r = each(item, `${path}[${i}]`, out);
      if (r === undefined) ok = false;
      else out.push(r);
    });
    return ok ? out : undefined;
  };

  // The working hours: a day of the week or a range such as mon-fri, to a list of shifts HH:MM-HH:MM. Two shifts on one
  // day are a split shift. A shift ends after it starts and at 24:00 at the latest; a shift across midnight is written as
  // two shifts, one on each day.
  const hours = (v, p) => {
    if (!isObject(v)) return bad(p, `must be an object from a day of the week, or a range such as mon-fri, to a list of shifts such as ["09:00-12:00", "13:00-17:30"], not ${kindOf(v)}`);
    const week = Array.from({ length: 7 }, () => null);
    let ok = true;
    const keys = Object.keys(v);
    if (keys.length === 0) return bad(p, 'names no working day');
    for (const key of keys) {
      const q = `${p}.${key}`;
      const w = readWeekdays(key);
      if (!w) {
        bad(q, 'is not a day of the week: write mon, tue, wed, thu, fri, sat, sun or a range such as mon-fri');
        ok = false;
        continue;
      }
      const twice = w.find((d) => week[d] !== null);
      if (twice !== undefined) {
        bad(q, `names ${WEEKDAYS[twice]} again`);
        ok = false;
        continue;
      }
      const shifts = list(v[key], q, lim.maxShifts, (s, r) => {
        if (typeof s !== 'string') return bad(r, `must be a shift written HH:MM-HH:MM, not ${kindOf(s)}`);
        const m = SHIFT.exec(s);
        if (!m) return bad(r, `${safeText(s, 30)} is not a shift written HH:MM-HH:MM from 00:00 to 24:00, such as 09:00-17:30`);
        const start = Number(m[1]) * 60 + Number(m[2]);
        const end = Number(m[3]) * 60 + Number(m[4]);
        if (end > 1440) return bad(r, `${s} ends after 24:00`);
        if (end <= start) return bad(r, `${s} ends before it starts; a shift across midnight is written as two shifts, one ending at 24:00 and one starting at 00:00 on the next day`);
        return [start, end];
      }, 'shifts');
      if (shifts === undefined) {
        ok = false;
        continue;
      }
      const sorted = [...shifts].sort((a, b) => a[0] - b[0]);
      const overlap = sorted.findIndex((s, i) => i > 0 && s[0] < sorted[i - 1][1]);
      if (overlap > 0) {
        bad(q, `the shifts ${clockText(sorted[overlap - 1][0])}-${clockText(sorted[overlap - 1][1])} and ${clockText(sorted[overlap][0])}-${clockText(sorted[overlap][1])} overlap`);
        ok = false;
        continue;
      }
      for (const d of w) week[d] = sorted;
    }
    if (ok && week.every((s) => s === null || s.length === 0)) return bad(p, 'holds no shift');
    return ok ? week.map((s) => s ?? []) : undefined;
  };

  const days = (v, p) => list(v, p, lim.maxDaysOff, (d, q, out) => {
    const day = typeof d === 'string' ? dayOfDate(d) : null;
    if (day === null) return bad(q, `${safeText(JSON.stringify(d) ?? String(d), 40)} is not a date written YYYY-MM-DD`);
    if (out.includes(day)) return bad(q, 'is named twice');
    return day;
  }, 'days');

  const logins = new Set();
  const person = (v, p) => {
    if (!isObject(v)) return bad(p, `must be an object with login, zone and hours, not ${kindOf(v)}`);
    const e = {};
    for (const key of Object.keys(v)) {
      if (!Object.hasOwn(PERSON_KEYS, key)) {
        bad(`${p}.${key}`, unknownKey(key, Object.keys(PERSON_KEYS)));
        continue;
      }
      e[key] = v[key];
    }
    for (const k of ['login', 'zone', 'hours']) if (e[k] === undefined) bad(`${p}.${k}`, k === 'login' ? 'is needed: the GitHub login of the person' : k === 'zone' ? 'is needed: the time zone of the person, such as Europe/Berlin' : 'is needed: the working hours of the person by day of the week, in local time');
    let login;
    if (e.login !== undefined) {
      if (typeof e.login !== 'string' || CONTROL.test(e.login) || !isLogin(e.login)) {
        bad(`${p}.login`, typeof e.login === 'string' && e.login.includes('@') ? 'holds an @; give the GitHub login, the tool needs no email address' : `${safeText(typeof e.login === 'string' ? e.login : kindOf(e.login), 60)} is not a GitHub login: letters, digits and single hyphens, at most 39 characters`);
      } else if (logins.has(loginKey(e.login))) bad(`${p}.login`, `${e.login} is the login of another person (logins are compared without case)`);
      else {
        logins.add(loginKey(e.login));
        login = e.login;
      }
    }
    let zone;
    if (e.zone !== undefined) {
      if (typeof e.zone !== 'string') bad(`${p}.zone`, `must be a time zone name such as Europe/Berlin, not ${kindOf(e.zone)}`);
      else {
        const z = checkZone(e.zone);
        if (z.ok) zone = e.zone;
        else bad(`${p}.zone`, `${safeText(e.zone, 70)} ${z.reason}`);
      }
    }
    const week = e.hours === undefined ? undefined : hours(e.hours, `${p}.hours`);
    const daysOff = e.daysOff === undefined ? [] : days(e.daysOff, `${p}.daysOff`);
    if (has(p)) return undefined;
    return { login, key: loginKey(login), zone, week, daysOff };
  };

  if (!isObject(value)) {
    bad('', `the team file must be one JSON object, not ${kindOf(value)}`);
    throw new ConfigError(problems);
  }
  let name = '';
  let people;
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(TEAM_KEYS, key)) {
      bad(key, unknownKey(key, Object.keys(TEAM_KEYS)));
      continue;
    }
    if (key === 'name') {
      const v = value.name;
      if (typeof v !== 'string' || v.trim() === '' || v.length > lim.maxName || CONTROL.test(v)) bad('name', `must be a string of 1 to ${lim.maxName} characters with no control character`);
      else name = v;
    } else people = list(value.people, 'people', lim.maxPeople, person, 'people');
  }
  if (value.people === undefined) bad('people', 'is needed: the people of the team, each with a login, a time zone and working hours');
  if (problems.length) throw new ConfigError(problems);
  return { name: safeText(name, lim.maxName), people };
}

// Reads the text of a team file into the normal form. file is the path shown. Throws ConfigError with every problem.
export function readTeam(text, file = 'team') {
  const parsed = readStrictJson(text, file);
  return validateTeam(parsed.value, parsed.lines, file);
}
