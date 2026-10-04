import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, EVENT_FIELDS, EVENT_KINDS, PULL_FIELDS, PULL_LIMITS, REVIEW_FIELDS, REVIEW_STATES, TOP_KEYS, readPulls } from '../src/index.js';
import { at, event, json, lineOf, merged, ms, pull, pullsFile, review } from './helpers.js';

const read = (object) => readPulls(json(object), 'pulls.json');
const problems = (object) => {
  try {
    read(object);
  } catch (error) {
    assert.ok(error instanceof ConfigError, error.message);
    return error.problems.map((p) => p.text);
  }
  assert.fail('the pull request file was accepted');
  return [];
};
const refused = (object, pattern) => assert.ok(problems(object).some((p) => pattern.test(p)), problems(object).join('\n'));

test('pulls: the fields read from pulls, reviews and events, with every time in milliseconds of UTC', () => {
  const file = pullsFile([merged(7, 'ana', at(0, '09:00'), at(1, '10:00')), pull(3, 'bo', at(0, '08:00'), { draft: true })], { 7: [review('bo', 'APPROVED', at(0, '11:00')), review('Ana', 'commented', at(0, '10:00'))] }, { 7: [event('merged', at(1, '10:00')), event('labeled', at(0, '09:30')), event('ready_for_review', at(0, '09:00'))] });
  const { pulls, latest } = read(file);
  assert.deepEqual(pulls.map((p) => p.number), [3, 7], 'sorted by number');
  const p = pulls[1];
  assert.equal(p.author, 'ana');
  assert.equal(p.authorType, 'User');
  assert.equal(p.state, 'closed');
  assert.equal(p.created, ms(0, '09:00'));
  assert.equal(p.merged, ms(1, '10:00'));
  assert.equal(p.closed, ms(1, '10:00'));
  assert.deepEqual(p.reviews.map((r) => [r.login, r.state, r.submitted]), [['Ana', 'COMMENTED', ms(0, '10:00')], ['bo', 'APPROVED', ms(0, '11:00')]], 'sorted by submitted_at, states in upper case');
  assert.deepEqual(p.events.map((e) => e.event), ['ready_for_review', 'merged'], 'events the tool does not read are skipped');
  assert.equal(pulls[0].draft, true);
  assert.equal(pulls[0].events, null, 'a pull with no events entry has no list of events');
  assert.equal(latest, ms(1, '10:00'));
  assert.deepEqual(TOP_KEYS, ['pulls', 'reviews', 'events']);
  assert.deepEqual(PULL_FIELDS, ['number', 'state', 'draft', 'user.login', 'user.type', 'created_at', 'closed_at', 'merged_at']);
  assert.deepEqual(REVIEW_FIELDS, ['user.login', 'user.type', 'state', 'submitted_at']);
  assert.deepEqual(EVENT_FIELDS, ['event', 'created_at']);
  assert.deepEqual(REVIEW_STATES, ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']);
  assert.deepEqual(EVENT_KINDS, ['ready_for_review', 'convert_to_draft', 'closed', 'reopened', 'merged']);
});

test('pulls: the fields GitHub sends that the tool does not read are skipped, and never kept', () => {
  const p = pull(1, 'ana', at(0, '09:00'), { title: 'secret title', body: 'secret body', labels: [{ name: 'x' }], head: { repo: { owner: { login: 'x' } } } });
  const { pulls } = read(pullsFile([p]));
  const kept = JSON.stringify(pulls);
  for (const word of ['secret', 'Not read', 'labels', 'head']) assert.ok(!kept.includes(word), word);
});

test('pulls: the top level is strict: pulls and reviews are needed, events may be left out, nothing else is allowed', () => {
  refused({ reviews: {} }, /pulls: is needed: the list of pull requests/);
  refused({ pulls: [] }, /reviews: is needed: an object from each pull number to its list of reviews/);
  refused({ pulls: {}, reviews: {} }, /pulls: must be a list, not an object/);
  refused({ pulls: [], reviews: [] }, /reviews: must be an object from pull numbers to lists of reviews, not an array/);
  refused({ pulls: [], reviews: {}, events: [] }, /events: must be an object/);
  refused({ pulls: [], reviews: {}, comments: {} }, /comments: unknown key; the keys here are pulls, reviews, events/);
  refused([pull(1, 'ana', at(0))], /must be one JSON object with the keys pulls, reviews and events, not an array/);
  assert.deepEqual(read({ pulls: [], reviews: {} }).pulls, []);
});

test('pulls: every pull needs its reviews, even an empty list, so a missing export is not read as no review', () => {
  refused({ pulls: [pull(1, 'ana', at(0))], reviews: {} }, /reviews: has no list for #1; give \[\] for a pull request with no review/);
  refused({ pulls: [pull(1, 'ana', at(0))], reviews: { 1: [], 2: [] } }, /reviews\.2: #2 is not in pulls/);
  refused({ pulls: [pull(1, 'ana', at(0))], reviews: { 1: [], '01': [] } }, /01 is not a pull number/);
  refused({ pulls: [pull(1, 'ana', at(0))], reviews: { 1: {} } }, /reviews\.1: must be a list, not an object/);
  refused({ pulls: [pull(1, 'ana', at(0))], reviews: { 1: [] }, events: { 9: [] } }, /events\.9: #9 is not in pulls/);
});

test('pulls: missing or broken timestamps fail closed, with the field and its line', () => {
  const text = json(pullsFile([pull(1, 'ana', 'yesterday')]));
  try {
    readPulls(text, 'pulls.json');
    assert.fail('accepted');
  } catch (error) {
    assert.match(error.problems[0].text, new RegExp(`^pulls\\.json:${lineOf(text, '"created_at"')}: pulls\\[0\\]\\.created_at: "yesterday" is not a timestamp written YYYY-MM-DDTHH:MM:SSZ`));
  }
  const noCreated = pull(1, 'ana', at(0));
  delete noCreated.created_at;
  refused(pullsFile([noCreated]), /created_at: is missing: the moment the pull request was opened/);
  const noClosed = pull(1, 'ana', at(0));
  delete noClosed.closed_at;
  refused(pullsFile([noClosed]), /closed_at: is missing: null for an open pull request/);
  refused(pullsFile([pull(1, 'ana', at(0), { merged_at: 5 })]), /merged_at: a number is not a timestamp written YYYY-MM-DDTHH:MM:SSZ, or null/);
  refused(pullsFile([pull(1, 'ana', at(0))], { 1: [review('bo', 'APPROVED', undefined)] }), /submitted_at: is missing: the moment the review was submitted; only a PENDING review has none/);
  refused(pullsFile([pull(1, 'ana', at(0))], { 1: [review('bo', 'COMMENTED', null)] }), /submitted_at: null is not a timestamp/);
  refused(pullsFile([pull(1, 'ana', at(0))], {}, { 1: [{ event: 'closed' }] }), /created_at: is missing: the moment of the closed event/);
});

test('pulls: a PENDING review may have no submitted_at; a review state the tool does not know is refused', () => {
  const { pulls } = read(pullsFile([pull(1, 'ana', at(0))], { 1: [review('bo', 'PENDING', undefined), review('cy', 'pending', null)] }));
  assert.deepEqual(pulls[0].reviews.map((r) => [r.state, r.submitted]), [['PENDING', null], ['PENDING', null]]);
  refused(pullsFile([pull(1, 'ana', at(0))], { 1: [review('bo', 'LGTM', at(0))] }), /"LGTM" is not a review state \(APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED, PENDING\)/);
  refused(pullsFile([pull(1, 'ana', at(0))], { 1: [{ user: { login: 'bo' }, submitted_at: at(0) }] }), /a missing state is not a review state/);
});

test('pulls: a null user is read as no author or no reviewer; a user without a login is refused', () => {
  const { pulls } = read(pullsFile([pull(1, null, at(0))], { 1: [review(null, 'COMMENTED', at(0, '01:00'))] }));
  assert.equal(pulls[0].author, null);
  assert.equal(pulls[0].reviews[0].login, null);
  refused(pullsFile([pull(1, 'ana', at(0), { user: { id: 1 } })]), /user\.login: is missing or not a string/);
  refused(pullsFile([pull(1, 'ana', at(0), { user: 'ana' })]), /must be a user object with a login, or null, not a string/);
  refused(pullsFile([pull(1, 'ana', at(0), { user: { login: 'ana', type: 5 } })]), /user\.type: must be a string/);
  const noUser = pull(1, 'ana', at(0));
  delete noUser.user;
  refused(pullsFile([noUser]), /user: is missing: the author of the pull request, or null/);
});

test('pulls: numbers, states and draft flags are checked', () => {
  refused(pullsFile([pull(1, 'ana', at(0)), pull(1, 'bo', at(0))]), /#1 is in the list twice/);
  refused(pullsFile([pull(0, 'ana', at(0))]), /0 is not a pull number/);
  refused(pullsFile([pull('7', 'ana', at(0))]), /7 is not a pull number/);
  refused(pullsFile([pull(1, 'ana', at(0), { state: 'merged' })]), /"merged" is not open or closed/);
  refused(pullsFile([pull(1, 'ana', at(0), { draft: 'no' })]), /draft: must be true or false, not a string/);
  refused({ pulls: ['x'], reviews: {} }, /pulls\[0\]: must be a pull request object, not a string/);
  const noDraft = pull(1, 'ana', at(0));
  delete noDraft.draft;
  assert.equal(read(pullsFile([noDraft])).pulls[0].draft, false, 'a pull without a draft field is not a draft');
});

test('pulls: times that contradict each other fail closed', () => {
  refused(pullsFile([pull(1, 'ana', at(1), { closed_at: at(2) })]), /#1 is open but has closed_at; the file contradicts itself/);
  refused(pullsFile([pull(1, 'ana', at(1), { state: 'closed' })]), /#1 is closed but closed_at is null/);
  refused(pullsFile([pull(1, 'ana', at(1), { state: 'closed', closed_at: at(0) })]), /#1 was closed before it was opened/);
  refused(pullsFile([merged(1, 'ana', at(1), at(0), { closed_at: at(2) })]), /#1 was merged before it was opened/);
  refused(pullsFile([merged(1, 'ana', at(0), at(2), { closed_at: at(1) })]), /#1 was merged after closed_at/);
  refused(pullsFile([pull(1, 'ana', at(1))], { 1: [review('bo', 'COMMENTED', at(0))] }), /a review of #1 was submitted before the pull request was opened/);
  refused(pullsFile([pull(1, 'ana', at(1))], {}, { 1: [event('ready_for_review', at(0))] }), /a ready_for_review event of #1 comes before the pull request was opened/);
  refused(pullsFile([pull(1, 'ana', at(1))], {}, { 1: [{ created_at: at(1) }] }), /event: is missing or not a string/);
});

test('pulls: a review list or an event list over its limit is refused', () => {
  const many = Array.from({ length: PULL_LIMITS.maxReviews + 1 }, () => review('bo', 'COMMENTED', at(0, '10:00')));
  refused(pullsFile([pull(1, 'ana', at(0))], { 1: many }), /holds more than 1,000 items/);
  assert.equal(PULL_LIMITS.maxPulls, 10000);
});
