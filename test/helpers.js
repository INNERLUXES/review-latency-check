// Shared test helpers: pull request files, team files and configurations built inline, checked in memory or written into
// a temporary folder that is removed after the test. Paths are built with resolve() from forward-slash names, so the same
// test runs on Linux, macOS and Windows. The line a test expects is found with lineOf(), which counts lines the way the
// tool does, so a test never holds a line number worked out by hand for one system only. A timestamp is built from a day
// number with at(), so no test file holds a date or a number that reads like a year, and no test reads the clock. A day
// on which a zone changes its clocks is found with changeDay(), by asking Intl, so no test holds the date of a clock
// change either.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { DAY_MS, dateOfDay, lineStarts, main, offsetFromIntl, positionOf, weekdayOf } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'review-latency-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return positionOf(lineStarts(text), at).line;
}

// A Monday far from any edge of the calendar (the first day of the example), and the date YYYY-MM-DD of a day number.
export const DAY0 = 20514;
export const isoDay = (day) => dateOfDay(day);

// A GitHub timestamp: day d after DAY0 (or the day number itself when abs is true) at HH:MM UTC.
export const at = (d, hm = '00:00', abs = false) => `${isoDay(abs ? d : DAY0 + d)}T${hm}:00Z`;

// Milliseconds of UTC of day d after DAY0 at HH:MM.
export const ms = (d, hm = '00:00') => (DAY0 + d) * DAY_MS + Number(hm.slice(0, 2)) * 3600000 + Number(hm.slice(3, 5)) * 60000;

// The first Monday on or after a day number.
export const mondayFrom = (day) => day + ((8 - weekdayOf(day)) % 7);

// The first day on or after start whose local noon in zone has another UTC offset than the local noon of the day before,
// and the two offsets in minutes: the day on which the zone moves its clocks. direction 1 finds a move forward, -1 a
// move back.
export function changeDay(zone, start, direction = 1) {
  const noon = (day) => offsetFromIntl(zone, day * DAY_MS + DAY_MS / 2 - offsetFromIntl(zone, day * DAY_MS + DAY_MS / 2));
  for (let day = start; day < start + 800; day += 1) {
    const before = noon(day - 1);
    const after = noon(day);
    if (after !== before && Math.sign(after - before) === direction) return { day, before: before / 60000, after: after / 60000 };
  }
  throw new Error(`${zone} moves its clocks in no day after ${start}`);
}

// A person of a team file, and the team most tests use: one person in UTC and one in Berlin, both 09:00-17:00.
export const person = (login, zone = 'UTC', hours = { 'mon-fri': ['09:00-17:00'] }, extra = {}) => ({ login, zone, hours, ...extra });
export const TEAM = { name: 'Test team', people: [person('ana'), person('bo')] };
export const teamWith = (people, extra = {}) => ({ name: 'Test team', people, ...extra });

// The configuration most tests use: a first review within 120 working minutes.
export const CONFIG = { firstReviewLimit: { measure: 'working', minutes: 120 } };
export const configWith = (parts = {}) => {
  const c = { ...CONFIG, ...parts };
  for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
  return c;
};

// GitHub objects: a pull, a review and an issue event, with the fields the tool reads and a few it does not.
export const user = (login, type = 'User') => (login === null ? null : { login, id: 1, type, site_admin: false, name: 'Not read', email: null });
export function pull(number, author, created, extra = {}) {
  return { number, title: `Change ${number}`, state: 'open', user: user(author, extra.authorType), body: 'not read', created_at: created, updated_at: created, closed_at: null, merged_at: null, draft: false, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'authorType')) };
}
export const merged = (number, author, created, mergedAt, extra = {}) => pull(number, author, created, { state: 'closed', closed_at: mergedAt, merged_at: mergedAt, ...extra });
export const review = (login, state, submitted, type) => ({ id: 1, user: user(login, type), body: '', state, ...(submitted === undefined ? {} : { submitted_at: submitted }), commit_id: null });
export const event = (kind, created) => ({ id: 1, event: kind, actor: user('ana'), created_at: created });

// A pull request file from pulls, reviews by number and events by number. A pull with no reviews given gets [].
export function pullsFile(pulls, reviews = {}, events) {
  const r = {};
  for (const p of pulls) r[p.number] = reviews[p.number] ?? [];
  return { pulls, reviews: r, ...(events ? { events } : {}) };
}

export const json = (object) => `${JSON.stringify(object, null, 2)}\n`;

// The files of a run: pulls.json, team.json and config.json.
export const filesWith = (pulls, team = TEAM, config = CONFIG, extra = {}) => ({ 'pulls.json': json(pulls), 'team.json': json(team), 'config.json': json(config), ...extra });
export const ARGS = ['--pulls', 'pulls.json', '--team', 'team.json', '--config', 'config.json'];

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = ARGS, limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err, dir };
  });
}

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// Runs a pull request file and returns the JSON report with the exit code; throws on exit code 2.
export async function reportOf(pulls, team = TEAM, config = CONFIG, extraArgs = []) {
  const r = await run(filesWith(pulls, team, config), [...ARGS, '--format', 'json', '--time-labels', 'offset', ...extraArgs]);
  if (r.code === 2) throw new Error(r.err);
  return { ...JSON.parse(r.out), code: r.code };
}

// The pull of a report by number.
export const pullOf = (report, number) => report.pulls.find((p) => p.number === number);
