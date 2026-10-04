import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, makeClock, readTeam, teamWorkTimes, total, weekdayKey, workTimes } from '../src/index.js';
import { DAY0, changeDay, isoDay, json, mondayFrom, person, teamWith } from './helpers.js';

const H = 3600000;
const M = 60000;
const personOf = (p) => readTeam(json(teamWith([p])), 'team.json').people[0];
const timesOf = (p, from, to) => {
  const x = personOf(p);
  return workTimes(x, makeClock([x.zone], from - 2, to + 2), from, to);
};

test('hours: shifts in local time become moments of UTC with the offset of the zone; weekends hold no shift', () => {
  const w = timesOf(person('ana', 'Asia/Kolkata', { 'mon-fri': ['09:00-12:00', '13:00-17:30'] }), DAY0, DAY0 + 6);
  assert.equal(w.times.length, 10, 'two shifts on each of five days, none on Saturday and Sunday');
  assert.deepEqual(w.times[0], [DAY0 * DAY_MS + 3 * H + 30 * M, DAY0 * DAY_MS + 6 * H + 30 * M]);
  assert.equal(total(w.times), 5 * 7.5 * H);
  assert.ok(w.times.every(([a]) => Math.floor((a + 5.5 * H) / DAY_MS) - DAY0 < 5), 'every shift on a weekday in Kolkata');
  assert.deepEqual(w.odd, []);
});

test('hours: a shift that ends at 24:00 touches the shift that starts at 00:00 on the next day, and they join', () => {
  const w = timesOf(person('ana', 'UTC', { mon: ['20:00-24:00'], tue: ['00:00-04:00'] }), DAY0, DAY0 + 1);
  assert.deepEqual(w.times, [[DAY0 * DAY_MS + 20 * H, (DAY0 + 1) * DAY_MS + 4 * H]]);
});

test('hours: on the day the clocks move forward, the same local shift starts an hour earlier in UTC', () => {
  const forward = changeDay('America/New_York', DAY0, 1);
  const monday = mondayFrom(forward.day - 7);
  const w = timesOf(person('ben', 'America/New_York'), monday, monday + 13);
  const starts = w.times.map(([a]) => (a % DAY_MS) / H);
  assert.deepEqual(starts.slice(0, 5), [14, 14, 14, 14, 14], 'before the change 09:00 local is 14:00Z');
  assert.deepEqual(starts.slice(5), [13, 13, 13, 13, 13], 'after it 09:00 local is 13:00Z');
  assert.equal(total(w.times), 10 * 8 * H, 'each shift is still eight hours');
});

test('hours: a night shift across the skipped hour is an hour shorter, and gets a note; across the repeated hour, an hour longer', () => {
  const forward = changeDay('Europe/Berlin', DAY0, 1);
  const w = timesOf(person('ana', 'Europe/Berlin', { [weekdayKey(forward.day)]: ['02:30-06:00'] }), forward.day, forward.day);
  assert.equal(total(w.times), 2.5 * H, '02:30 does not exist; it is read on the clock before the change, 01:30Z, which is 03:30 on the new clock');
  assert.deepEqual(w.odd, [{ day: forward.day, minute: 150, kind: 'gap' }]);
  const back = changeDay('Europe/Berlin', DAY0, -1);
  const v = timesOf(person('ana', 'Europe/Berlin', { [weekdayKey(back.day)]: ['00:00-06:00'] }), back.day, back.day);
  assert.equal(total(v.times), 7 * H, 'the night the clocks move back has an hour more');
  const r = timesOf(person('ana', 'Europe/Berlin', { [weekdayKey(back.day)]: ['02:30-06:00'] }), back.day, back.day);
  assert.deepEqual(r.odd, [{ day: back.day, minute: 150, kind: 'repeated' }]);
  assert.equal(total(r.times), 4.5 * H, '02:30 happens twice and is read as the first of the two');
});

test('hours: a day off takes out the shifts of that local day only', () => {
  const w = timesOf(person('ana', 'UTC', undefined, { daysOff: [isoDay(DAY0 + 2)] }), DAY0, DAY0 + 6);
  assert.equal(w.times.length, 4);
  assert.ok(!w.times.some(([a]) => Math.floor(a / DAY_MS) === DAY0 + 2));
});

test('hours: the team: each person by login key, and the time when at least one other person works', () => {
  const people = readTeam(json(teamWith([person('ana', 'UTC', { 'mon-fri': ['08:00-12:00'] }), person('bo', 'UTC', { 'mon-fri': ['10:00-14:00'] }), person('cy', 'UTC', { 'mon-fri': ['13:00-15:00'] })])), 'team.json').people;
  const clock = makeClock(['UTC'], DAY0 - 2, DAY0 + 2);
  const work = teamWorkTimes(people, clock, DAY0 * DAY_MS, DAY0 * DAY_MS + 20 * H);
  const day = (list) => list.filter(([a]) => Math.floor(a / DAY_MS) === DAY0).map(([a, b]) => [(a % DAY_MS) / H, (b % DAY_MS) / H]);
  assert.deepEqual(day(work.of('ana')), [[8, 12]]);
  assert.deepEqual(day(work.othersOf('ana')), [[10, 15]], 'bo and cy together');
  assert.deepEqual(day(work.othersOf('cy')), [[8, 14]], 'ana and bo together');
  assert.equal(work.othersOf('ana'), work.othersOf('ana'), 'kept once computed');
});
