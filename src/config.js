// The configuration: the limit a first review must meet, the percentile the report shows next to the median, the
// patterns of bot logins, and what to do with a login that is not in the team file. The limit has no default: the tool
// has no idea of a good wait of its own, and a configuration without firstReviewLimit is refused. Every key the tool does
// not know is an error, so a typo such as minute cannot silently change the limit, and an object that names a key twice
// is refused by the JSON reader.

import { isPattern, LOGIN_LIMITS } from './logins.js';
import { safeText } from './text.js';
import { ConfigError, collector, isObject, kindOf, readStrictJson, unknownKey } from './strict.js';

export const CONFIG_LIMITS = { maxLimitMinutes: 100000, minPercentile: 50, maxPercentile: 100 };

// The keys of the configuration, as a tree.
export const CONFIG_KEYS = {
  firstReviewLimit: { measure: 'measure', minutes: 'minutes' },
  percentile: 'percentile',
  bots: 'patterns',
  unknownLogins: 'policy'
};

// The defaults of the keys that may be left out. None of them is a limit: they choose what is shown and how strict the
// tool is with logins it does not know.
export const CONFIG_DEFAULTS = { percentile: 90, bots: [], unknownLogins: 'fail' };

export const MEASURES = ['working', 'wall'];
export const POLICIES = ['fail', 'exclude'];

// Checks the value of the configuration and builds the normal form:
// { limit: { measure, minutes }, percentile, bots, unknownLogins }.
export function validateConfig(value, lines = new Map(), file = 'config') {
  const { problems, bad } = collector(file, lines);
  const lim = CONFIG_LIMITS;
  if (!isObject(value)) {
    bad('', `the configuration must be one JSON object, not ${kindOf(value)}`);
    throw new ConfigError(problems);
  }
  const out = { limit: null, ...CONFIG_DEFAULTS };
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(CONFIG_KEYS, key)) {
      bad(key, unknownKey(key, Object.keys(CONFIG_KEYS)));
      continue;
    }
    const v = value[key];
    if (key === 'firstReviewLimit') {
      if (!isObject(v)) {
        bad(key, `must be an object such as { "measure": "working", "minutes": 480 }, not ${kindOf(v)}`);
        continue;
      }
      const limit = {};
      for (const k of Object.keys(v)) {
        const p = `${key}.${k}`;
        if (!Object.hasOwn(CONFIG_KEYS.firstReviewLimit, k)) bad(p, unknownKey(k, Object.keys(CONFIG_KEYS.firstReviewLimit)));
        else if (k === 'measure') {
          if (!MEASURES.includes(v[k])) bad(p, `${safeText(typeof v[k] === 'string' ? v[k] : kindOf(v[k]), 30)} is not a measure: write working (the working hours of the reviewer) or wall (the clock on the wall)`);
          else limit.measure = v[k];
        } else if (typeof v[k] !== 'number' || !Number.isSafeInteger(v[k]) || v[k] < 1 || v[k] > lim.maxLimitMinutes) bad(p, `${safeText(typeof v[k] === 'number' ? String(v[k]) : kindOf(v[k]), 30)} is not a whole number of minutes from 1 to ${lim.maxLimitMinutes.toLocaleString('en-US')}`);
        else limit.minutes = v[k];
      }
      if (v.measure === undefined) bad(`${key}.measure`, 'is needed: working or wall');
      if (v.minutes === undefined) bad(`${key}.minutes`, 'is needed: the minutes a first review may wait at most; the tool has no limit of its own');
      if (limit.measure && limit.minutes) out.limit = limit;
    } else if (key === 'percentile') {
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < lim.minPercentile || v > lim.maxPercentile) bad(key, `${safeText(typeof v === 'number' ? String(v) : kindOf(v), 30)} is not a whole number from ${lim.minPercentile} to ${lim.maxPercentile}`);
      else out.percentile = v;
    } else if (key === 'bots') {
      if (!Array.isArray(v)) bad(key, `must be a list of logins or patterns such as ["release-helper", "*[bot]"], not ${kindOf(v)}`);
      else if (v.length > LOGIN_LIMITS.maxPatterns) bad(key, `holds more than ${LOGIN_LIMITS.maxPatterns} patterns`);
      else {
        const seen = new Set();
        const list = [];
        v.forEach((p, i) => {
          if (!isPattern(p)) bad(`${key}[${i}]`, `${safeText(typeof p === 'string' ? p : kindOf(p), 70)} is not a login or a pattern: letters, digits, hyphens, square brackets and *, at most ${LOGIN_LIMITS.maxPattern} characters`);
          else if (p.replace(/\*/g, '') === '') bad(`${key}[${i}]`, 'matches every login; the run would measure nothing');
          else if (seen.has(p.toLowerCase())) bad(`${key}[${i}]`, `${p} is named twice`);
          else {
            seen.add(p.toLowerCase());
            list.push(p);
          }
        });
        out.bots = list;
      }
    } else if (key === 'unknownLogins') {
      if (!POLICIES.includes(v)) bad(key, `${safeText(typeof v === 'string' ? v : kindOf(v), 30)} is not a policy: write fail (stop the run) or exclude (leave the pull or the review out, with a note)`);
      else out.unknownLogins = v;
    }
  }
  if (value.firstReviewLimit === undefined) bad('firstReviewLimit', 'is needed: { "measure": "working" or "wall", "minutes": N }; the tool has no limit of its own');
  if (problems.length) throw new ConfigError(problems);
  return out;
}

// Reads the text of a configuration into the normal form. Throws ConfigError with every problem.
export function readConfig(text, file = 'config') {
  const parsed = readStrictJson(text, file);
  return validateConfig(parsed.value, parsed.lines, file);
}
