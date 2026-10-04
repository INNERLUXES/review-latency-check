// The pull request file: responses of the GitHub REST API that the user saved, put together in one JSON object.
//
//   {
//     "pulls":   [ ...the items of GET /repos/{owner}/{repo}/pulls?state=all... ],
//     "reviews": { "<number>": [ ...the items of GET /repos/{owner}/{repo}/pulls/{number}/reviews... ] },
//     "events":  { "<number>": [ ...the items of GET /repos/{owner}/{repo}/issues/{number}/events... ] }
//   }
//
// The tool reads only these fields (docs/inputs.md quotes the documentation of each):
//   pull:   number, state, draft, user.login, user.type, created_at, closed_at, merged_at
//   review: user.login, user.type, state, submitted_at
//   event:  event, created_at, for the events ready_for_review, convert_to_draft, closed, reopened and merged
// Every other field of a GitHub object (title, body, labels, avatar addresses, user.name, user.email and the rest) is
// skipped and never reaches a report. The three top-level keys are checked strictly: another key is an error. Inside a
// GitHub object other fields are allowed, because GitHub sends dozens of them, but a field named twice is still refused
// by the JSON reader.
//
// The reader fails closed: a pull without a valid created_at, a submitted review without submitted_at, a pull whose
// reviews were not given, a state the tool does not know, or times that contradict each other stop the run with exit
// code 2, because a number built on them would be wrong without saying so. docs/method.md lists each case.

import { JSON_LIMITS } from './json.js';
import { parseTimestamp } from './days.js';
import { safeText } from './text.js';
import { ConfigError, collector, isObject, kindOf, readStrictJson } from './strict.js';

export const PULL_LIMITS = { maxPulls: 10000, maxReviews: 1000, maxEvents: 3000, maxValues: 20000000, maxStringLength: 1048576 };

export const TOP_KEYS = ['pulls', 'reviews', 'events'];

// The fields read from each object, for the documents and the tests.
export const PULL_FIELDS = ['number', 'state', 'draft', 'user.login', 'user.type', 'created_at', 'closed_at', 'merged_at'];
export const REVIEW_FIELDS = ['user.login', 'user.type', 'state', 'submitted_at'];
export const EVENT_FIELDS = ['event', 'created_at'];

// The review states of the REST API, in upper case as the list of reviews writes them. The timeline writes them in lower
// case; both are read. PENDING is a review that was never submitted.
export const REVIEW_STATES = ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING'];

// The events that change whether a pull is open, and whether it is a draft. Other events are skipped unread.
export const EVENT_KINDS = ['ready_for_review', 'convert_to_draft', 'closed', 'reopened', 'merged'];

const NUMBER_KEY = /^[1-9][0-9]{0,9}$/;
const upper = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32));

// Reads the value of a pull request file into { pulls: [...], latest } where each pull is
// { number, author, authorType, state, draft, created, closed, merged, reviews: [...], events: [...] | null } and every
// time is milliseconds of UTC. latest is the last moment anywhere in the file. Throws ConfigError with every problem.
export function validatePulls(value, lines = new Map(), file = 'pulls') {
  const { problems, bad } = collector(file, lines);
  const lim = PULL_LIMITS;
  let latest = -Infinity;
  const stamp = (v, path, what, nullable) => {
    if (v === null && nullable) return null;
    if (v === undefined) return bad(path, `is missing: ${what}`);
    const t = parseTimestamp(v);
    if (t === null) return bad(path, `${safeText(typeof v === 'string' ? JSON.stringify(v) : kindOf(v), 60)} is not a timestamp written YYYY-MM-DDTHH:MM:SSZ${nullable ? ', or null' : ''}`);
    if (t > latest) latest = t;
    return t;
  };
  const userOf = (v, path) => {
    if (v === null) return { login: null, type: null };
    if (!isObject(v)) return bad(path, `must be a user object with a login, or null, not ${kindOf(v)}`);
    if (typeof v.login !== 'string' || v.login === '') return bad(`${path}.login`, 'is missing or not a string');
    if (v.type !== undefined && typeof v.type !== 'string') return bad(`${path}.type`, `must be a string, not ${kindOf(v.type)}`);
    return { login: safeText(v.login, 60), type: v.type ?? null };
  };

  if (!isObject(value)) {
    bad('', `the pull request file must be one JSON object with the keys pulls, reviews and events, not ${kindOf(value)}`);
    throw new ConfigError(problems);
  }
  for (const key of Object.keys(value)) if (!TOP_KEYS.includes(key)) bad(key, `unknown key; the keys here are ${TOP_KEYS.join(', ')}`);
  if (!Array.isArray(value.pulls)) bad('pulls', value.pulls === undefined ? 'is needed: the list of pull requests as GET /repos/{owner}/{repo}/pulls?state=all returns it' : `must be a list, not ${kindOf(value.pulls)}`);
  if (!isObject(value.reviews)) bad('reviews', value.reviews === undefined ? 'is needed: an object from each pull number to its list of reviews, [] for a pull with no review' : `must be an object from pull numbers to lists of reviews, not ${kindOf(value.reviews)}`);
  if (value.events !== undefined && !isObject(value.events)) bad('events', `must be an object from pull numbers to lists of issue events, not ${kindOf(value.events)}`);
  if (problems.length) throw new ConfigError(problems);
  if (value.pulls.length > lim.maxPulls) {
    bad('pulls', `holds more than ${lim.maxPulls.toLocaleString('en-US')} pull requests`);
    throw new ConfigError(problems);
  }

  const pulls = [];
  const numbers = new Set();
  value.pulls.forEach((p, i) => {
    const path = `pulls[${i}]`;
    if (!isObject(p)) return bad(path, `must be a pull request object, not ${kindOf(p)}`);
    const before = problems.length;
    let number;
    if (typeof p.number !== 'number' || !Number.isSafeInteger(p.number) || p.number < 1 || p.number > 9999999999) bad(`${path}.number`, `${p.number === undefined ? 'is missing' : `${safeText(String(p.number), 30)} is not a pull number`}; every pull needs its number`);
    else if (numbers.has(p.number)) bad(`${path}.number`, `#${p.number} is in the list twice`);
    else {
      number = p.number;
      numbers.add(number);
    }
    const state = p.state;
    if (state !== 'open' && state !== 'closed') bad(`${path}.state`, `${safeText(state === undefined ? 'a missing state' : JSON.stringify(state) ?? '', 40)} is not open or closed`);
    if (p.draft !== undefined && typeof p.draft !== 'boolean') bad(`${path}.draft`, `must be true or false, not ${kindOf(p.draft)}`);
    const user = userOf(p.user, `${path}.user`);
    if (p.user === undefined) bad(`${path}.user`, 'is missing: the author of the pull request, or null');
    const created = stamp(p.created_at, `${path}.created_at`, 'the moment the pull request was opened', false);
    const closed = stamp(p.closed_at, `${path}.closed_at`, 'null for an open pull request, or the moment it was closed', true);
    const merged = stamp(p.merged_at, `${path}.merged_at`, 'null for a pull request that was not merged, or the moment it was merged', true);
    if (problems.length > before) return undefined;
    if (state === 'open' && (closed !== null || merged !== null)) return bad(path, `#${number} is open but has ${closed !== null ? 'closed_at' : 'merged_at'}; the file contradicts itself`);
    if (state === 'closed' && closed === null) return bad(`${path}.closed_at`, `#${number} is closed but closed_at is null`);
    if (closed !== null && closed < created) return bad(`${path}.closed_at`, `#${number} was closed before it was opened`);
    if (merged !== null && merged < created) return bad(`${path}.merged_at`, `#${number} was merged before it was opened`);
    if (merged !== null && merged > closed) return bad(`${path}.merged_at`, `#${number} was merged after closed_at`);
    pulls.push({ number, author: user.login, authorType: user.type, state, draft: p.draft === true, created, closed, merged, reviews: [], events: null, path });
    return undefined;
  });

  const byNumber = new Map(pulls.map((p) => [String(p.number), p]));
  const keyed = (obj, name, max, each) => {
    for (const key of Object.keys(obj)) {
      const path = `${name}.${key}`;
      if (!NUMBER_KEY.test(key)) {
        bad(path, `${safeText(key, 30)} is not a pull number`);
        continue;
      }
      if (!numbers.has(Number(key))) {
        bad(path, `#${key} is not in pulls`);
        continue;
      }
      const list = obj[key];
      if (!Array.isArray(list)) {
        bad(path, `must be a list, not ${kindOf(list)}`);
        continue;
      }
      if (list.length > max) {
        bad(path, `holds more than ${max.toLocaleString('en-US')} items`);
        continue;
      }
      const pull = byNumber.get(key);
      list.forEach((item, i) => each(item, `${path}[${i}]`, pull));
    }
  };

  keyed(value.reviews, 'reviews', lim.maxReviews, (r, path, pull) => {
    if (!isObject(r)) return bad(path, `must be a review object, not ${kindOf(r)}`);
    if (!pull) return undefined;
    const before = problems.length;
    if (r.user === undefined) bad(`${path}.user`, 'is missing: the reviewer, or null');
    const user = r.user === undefined ? undefined : userOf(r.user, `${path}.user`);
    const state = typeof r.state === 'string' ? upper(r.state) : null;
    if (!REVIEW_STATES.includes(state)) return bad(`${path}.state`, `${safeText(r.state === undefined ? 'a missing state' : JSON.stringify(r.state) ?? '', 40)} is not a review state (${REVIEW_STATES.join(', ')})`);
    const pending = state === 'PENDING';
    const submitted = pending && (r.submitted_at === undefined || r.submitted_at === null) ? null : stamp(r.submitted_at, `${path}.submitted_at`, 'the moment the review was submitted; only a PENDING review has none', false);
    if (problems.length > before) return undefined;
    if (submitted !== null && submitted < pull.created) return bad(`${path}.submitted_at`, `a review of #${pull.number} was submitted before the pull request was opened`);
    pull.reviews.push({ login: user.login, type: user.type, state, submitted, path });
    return undefined;
  });
  for (const p of pulls) if (!Object.hasOwn(value.reviews, String(p.number))) bad(`reviews`, `has no list for #${p.number}; give [] for a pull request with no review, so a missing export is not read as no review`);

  if (value.events) {
    for (const key of Object.keys(value.events)) {
      const pull = byNumber.get(key);
      if (pull) pull.events = [];
    }
    keyed(value.events, 'events', lim.maxEvents, (e, path, pull) => {
      if (!isObject(e)) return bad(path, `must be an event object, not ${kindOf(e)}`);
      if (typeof e.event !== 'string') return bad(`${path}.event`, 'is missing or not a string');
      if (!EVENT_KINDS.includes(e.event) || !pull) return undefined;
      const at = stamp(e.created_at, `${path}.created_at`, `the moment of the ${e.event} event`, false);
      if (at === null || at === undefined) return undefined;
      if (at < pull.created) return bad(`${path}.created_at`, `a ${e.event} event of #${pull.number} comes before the pull request was opened`);
      pull.events.push({ event: e.event, at, path });
      return undefined;
    });
  }

  if (problems.length) throw new ConfigError(problems);
  for (const p of pulls) {
    p.reviews.sort((a, b) => (a.submitted ?? Infinity) - (b.submitted ?? Infinity));
    if (p.events) p.events.sort((a, b) => a.at - b.at);
  }
  pulls.sort((a, b) => a.number - b.number);
  return { pulls, latest: Number.isFinite(latest) ? latest : null };
}

// The limits of the JSON reader for a pull request file: GitHub objects are large and deep, so the file may hold many
// more values than a configuration; lines are kept for the values down to a review field.
export const PULLS_JSON_LIMITS = { ...JSON_LIMITS, maxValues: PULL_LIMITS.maxValues, maxStringLength: PULL_LIMITS.maxStringLength, linesUpTo: 4 };

// Reads the text of a pull request file. Throws ConfigError with every problem.
export function readPulls(text, file = 'pulls') {
  const parsed = readStrictJson(text, file, PULLS_JSON_LIMITS);
  return validatePulls(parsed.value, parsed.lines, file);
}
