import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, PERSON_KEYS, TEAM_KEYS, TEAM_LIMITS, hoursText, readTeam, readWeekdays } from '../src/index.js';
import { DAY0, isoDay, json, lineOf, person, teamWith } from './helpers.js';

const read = (object) => readTeam(json(object), 'team.json');
const problems = (object) => {
  try {
    read(object);
  } catch (error) {
    assert.ok(error instanceof ConfigError, error.message);
    return error.problems.map((p) => p.text);
  }
  assert.fail('the team file was accepted');
  return [];
};
const refused = (object, pattern) => assert.ok(problems(object).some((p) => pattern.test(p)), problems(object).join('\n'));

test('team: the normal form keeps the login as written, a key without case, the zone, the week and the days off', () => {
  const t = read(teamWith([person('Ana-Dev', 'Europe/Berlin', { 'mon-thu': ['09:00-12:00', '13:00-17:30'], fri: ['09:00-13:00'] }, { daysOff: [isoDay(DAY0 + 2)] }), person('bo')]));
  assert.equal(t.name, 'Test team');
  const [ana, bo] = t.people;
  assert.equal(ana.login, 'Ana-Dev');
  assert.equal(ana.key, 'ana-dev');
  assert.equal(ana.zone, 'Europe/Berlin');
  assert.deepEqual(ana.week[1], [[540, 720], [780, 1050]]);
  assert.deepEqual(ana.week[5], [[540, 780]]);
  assert.deepEqual(ana.week[6], []);
  assert.deepEqual(ana.daysOff, [DAY0 + 2]);
  assert.equal(hoursText(ana.week), 'mon-thu 09:00-12:00, 13:00-17:30; fri 09:00-13:00');
  assert.deepEqual(bo.daysOff, []);
  assert.deepEqual(TEAM_KEYS, { name: 'string', people: 'people' });
  assert.deepEqual(Object.keys(PERSON_KEYS), ['login', 'zone', 'hours', 'daysOff']);
});

test('team: weekdays as a day or a range from Monday to Sunday, never a wrap', () => {
  assert.deepEqual(readWeekdays('mon'), [1]);
  assert.deepEqual(readWeekdays('sat-sun'), [6, 0]);
  assert.deepEqual(readWeekdays('mon-fri'), [1, 2, 3, 4, 5]);
  for (const bad of ['fri-mon', 'mon-mon', 'monday', 'mon-tue-wed', '', 'Mon']) assert.equal(readWeekdays(bad), null, bad);
});

test('team: an unknown key is an error with a suggestion, at every level, with its line', () => {
  const text = json({ name: 'x', poeple: [], people: [{ login: 'ana', zone: 'UTC', hours: { 'mon-fri': ['09:00-17:00'] }, hour: 1 }] });
  try {
    readTeam(text, 'team.json');
    assert.fail('accepted');
  } catch (error) {
    const all = error.problems.map((p) => p.text).join('\n');
    assert.match(all, new RegExp(`team\\.json:${lineOf(text, '"poeple"')}: poeple: unknown key; did you mean people\\?`));
    assert.match(all, /people\[0\]\.hour: unknown key; did you mean hours\?/);
  }
  refused({ people: [person('ana')], members: 1 }, /members: unknown key; the keys here are name, people/);
});

test('team: a key named twice is refused by the JSON reader', () => {
  assert.throws(() => readTeam('{"people": [], "people": []}', 'team.json'), /the name "people" appears twice in one object/);
});

test('team: logins must be GitHub logins, given once without case, never an email address', () => {
  refused(teamWith([person('ana@example.org')]), /holds an @; give the GitHub login/);
  refused(teamWith([person('-ana')]), /is not a GitHub login/);
  refused(teamWith([person('ana dev')]), /is not a GitHub login/);
  refused(teamWith([{ login: 42, zone: 'UTC', hours: { mon: ['09:00-10:00'] } }]), /a number is not a GitHub login/);
  refused(teamWith([person('ana'), person('ANA')]), /ANA is the login of another person \(logins are compared without case\)/);
  refused(teamWith([person(`ana${String.fromCharCode(27)}`)]), /is not a GitHub login/);
});

test('team: login, zone and hours are needed; the people list is needed and not empty', () => {
  refused(teamWith([{ zone: 'UTC', hours: { mon: ['09:00-10:00'] } }]), /people\[0\]\.login: is needed/);
  refused(teamWith([{ login: 'ana', hours: { mon: ['09:00-10:00'] } }]), /people\[0\]\.zone: is needed/);
  refused(teamWith([{ login: 'ana', zone: 'UTC' }]), /people\[0\]\.hours: is needed/);
  refused({ name: 'x' }, /people: is needed/);
  refused({ people: [] }, /people: is an empty list; name one person at least/);
  refused({ people: {} }, /people: must be a list, not an object/);
  refused([], /the team file must be one JSON object, not an array/);
  refused(teamWith([person('ana')], { name: '' }), /name: must be a string/);
  refused(teamWith(['ana']), /people\[0\]: must be an object with login, zone and hours, not a string/);
  refused(teamWith(Array.from({ length: TEAM_LIMITS.maxPeople + 1 }, (_, i) => person(`p${i}`))), /holds more than 200 people/);
});

test('team: time zones fail closed: an unknown name or a UTC offset stops the run', () => {
  refused(teamWith([person('ana', 'Mars/Base')]), /Mars\/Base is not a time zone that the Intl API of this Node knows/);
  refused(teamWith([person('ana', '+01:00')]), /is a UTC offset, not a time zone name/);
  refused(teamWith([person('ana', 5)]), /must be a time zone name such as Europe\/Berlin, not a number/);
});

test('team: shifts with near misses on each side', () => {
  assert.deepEqual(read(teamWith([person('ana', 'UTC', { mon: ['00:00-24:00'] })])).people[0].week[1], [[0, 1440]]);
  assert.deepEqual(read(teamWith([person('ana', 'UTC', { mon: ['23:59-24:00'] })])).people[0].week[1], [[1439, 1440]]);
  refused(teamWith([person('ana', 'UTC', { mon: ['17:00-09:00'] })]), /ends before it starts; a shift across midnight is written as two shifts/);
  refused(teamWith([person('ana', 'UTC', { mon: ['09:00-09:00'] })]), /ends before it starts/);
  refused(teamWith([person('ana', 'UTC', { mon: ['09:00-24:01'] })]), /ends after 24:00/);
  refused(teamWith([person('ana', 'UTC', { mon: ['9:00-17:00'] })]), /is not a shift written HH:MM-HH:MM/);
  refused(teamWith([person('ana', 'UTC', { mon: ['24:00-24:00'] })]), /is not a shift written HH:MM-HH:MM/);
  refused(teamWith([person('ana', 'UTC', { mon: [900] })]), /must be a shift written HH:MM-HH:MM, not a number/);
  refused(teamWith([person('ana', 'UTC', { mon: ['09:00-12:00', '11:00-13:00'] })]), /the shifts 09:00-12:00 and 11:00-13:00 overlap/);
  assert.deepEqual(read(teamWith([person('ana', 'UTC', { mon: ['13:00-17:00', '09:00-13:00'] })])).people[0].week[1], [[540, 780], [780, 1020]], 'touching shifts are fine, and sorted');
  refused(teamWith([person('ana', 'UTC', { 'mon-fri': ['09:00-17:00'], wed: ['10:00-11:00'] })]), /names wed again/);
  refused(teamWith([person('ana', 'UTC', { someday: ['09:00-17:00'] })]), /is not a day of the week/);
  refused(teamWith([person('ana', 'UTC', {})]), /names no working day/);
  refused(teamWith([person('ana', 'UTC', { mon: [] })]), /is an empty list/);
  refused(teamWith([person('ana', 'UTC', ['09:00-17:00'])]), /must be an object from a day of the week/);
  refused(teamWith([person('ana', 'UTC', { mon: Array.from({ length: 7 }, (_, i) => `0${i}:00-0${i}:30`) })]), /holds more than 6 shifts/);
});

test('team: days off are dates YYYY-MM-DD, each once', () => {
  refused(teamWith([person('ana', 'UTC', undefined, { daysOff: [3] })]), /3 is not a date written YYYY-MM-DD/);
  refused(teamWith([person('ana', 'UTC', undefined, { daysOff: [isoDay(DAY0), isoDay(DAY0)] })]), /is named twice/);
  refused(teamWith([person('ana', 'UTC', undefined, { daysOff: [`${isoDay(DAY0).slice(0, 4)}-02-30`] })]), /is not a date/);
  refused(teamWith([person('ana', 'UTC', undefined, { daysOff: [] })]), /is an empty list; leave the key out instead/);
});
