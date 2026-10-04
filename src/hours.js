// The working time of each person as moments of UTC. Each shift of the team file is written in local time; for every
// local day of the data it is turned into a moment of UTC with the offset the zone has at that moment, read from Intl
// through the clock of src/zones.js. A shift on the day the clocks move is therefore an hour shorter or longer than its
// clock times say, and a shift that starts or ends at a local time the clocks skip or repeat follows the rule of
// docs/method.md. Days off take out the shifts of that local day. Weekends are the days with no shift.

import { DAY_MS, MINUTE_MS, weekdayOf } from './days.js';
import { normalize, union } from './intervals.js';

// The working time of one person between two local days, inclusive: a sorted list of [from, to) moments, and the
// shifts that touch a skipped or repeated local time ({ day, minute, kind }).
export function workTimes(person, clock, fromDay, toDay) {
  const out = [];
  const odd = [];
  const off = new Set(person.daysOff);
  for (let day = fromDay; day <= toDay; day += 1) {
    if (off.has(day)) continue;
    for (const [start, end] of person.week[weekdayOf(day)]) {
      const a = clock.toUtc(person.zone, day * DAY_MS + start * MINUTE_MS);
      const b = clock.toUtc(person.zone, day * DAY_MS + end * MINUTE_MS);
      if (a.kind !== 'normal') odd.push({ day, minute: start, kind: a.kind });
      if (b.kind !== 'normal') odd.push({ day, minute: end, kind: b.kind });
      out.push([a.utc, b.utc]);
    }
  }
  return { times: normalize(out), odd };
}

// The working time of every person of the team over the days of the data, keyed by login key, with a day of margin on
// each side for the zones east and west of UTC. union() of several people is the time when at least one of them works.
export function teamWorkTimes(people, clock, fromMs, toMs) {
  const fromDay = Math.floor(fromMs / DAY_MS) - 1;
  const toDay = Math.floor(toMs / DAY_MS) + 1;
  const byKey = new Map();
  const odd = [];
  for (const p of people) {
    const w = workTimes(p, clock, fromDay, toDay);
    byKey.set(p.key, w.times);
    for (const o of w.odd) odd.push({ login: p.login, zone: p.zone, ...o });
  }
  const others = new Map();
  return {
    of: (key) => byKey.get(key),
    // The time when at least one person other than the given one works: the people who could have reviewed.
    othersOf(key) {
      if (!others.has(key)) others.set(key, union(...people.filter((p) => p.key !== key).map((p) => byKey.get(p.key))));
      return others.get(key);
    },
    odd
  };
}
