import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXCLUDED, SKIPPED_REVIEWS, weekdayKey } from '../src/index.js';
import { ARGS, CONFIG, DAY0, TEAM, at, changeDay, configWith, event, filesWith, merged, mondayFrom, person, pull, pullOf, pullsFile, reportOf, review, run, teamWith } from './helpers.js';

// The team of these tests works 09:00-17:00 UTC from Monday to Friday, and DAY0 is a Monday, so every number can be
// worked out by hand. The limit is 120 working minutes unless a test says otherwise.

test('first review, first approval and merge, on the wall and in the working hours of the reviewer, approver and author', async () => {
  const r = await reportOf(pullsFile([merged(1, 'ana', at(0, '08:00'), at(0, '16:00'))], { 1: [review('bo', 'COMMENTED', at(0, '11:00')), review('bo', 'APPROVED', at(0, '15:00'))] }));
  const p = pullOf(r, 1);
  assert.deepEqual(p.firstReview, { by: 'bo', zone: 'UTC', state: 'COMMENTED', wallMinutes: 180, workingMinutes: 120, at: 'day 0 (Mon) 11:00Z' });
  assert.deepEqual(p.firstApproval, { by: 'bo', zone: 'UTC', state: 'APPROVED', wallMinutes: 420, workingMinutes: 360, at: 'day 0 (Mon) 15:00Z' });
  assert.deepEqual(p.merge, { wallMinutes: 480, workingMinutes: 420, at: 'day 0 (Mon) 16:00Z' });
  assert.equal(p.late, false, '120 working minutes is not past a limit of 120');
  assert.equal(r.code, 0);
  assert.match(r.verdict.text, /^PASS - none of 1 pull request waited longer than 2h 00m of working hours for a first review$/);
});

test('the limit with a near miss on each side, in working minutes and on the wall', async () => {
  const one = (minute) => pullsFile([pull(1, 'ana', at(0, '09:00'))], { 1: [review('bo', 'COMMENTED', at(0, `11:${minute}`))] });
  assert.equal((await reportOf(one('00'))).code, 0);
  const late = await reportOf(one('01'));
  assert.equal(late.code, 1);
  assert.equal(pullOf(late, 1).late, true);
  assert.deepEqual(late.late.map((l) => [l.number, l.kind, l.by, l.wallMinutes, l.workingMinutes]), [[1, 'review', 'bo', 121, 121]]);
  // On the wall, a night counts; in working hours it does not.
  const night = pullsFile([pull(1, 'ana', at(0, '16:00'))], { 1: [review('bo', 'COMMENTED', at(1, '09:30'))] });
  assert.equal((await reportOf(night)).code, 0, '90 working minutes');
  const wall = await reportOf(night, TEAM, configWith({ firstReviewLimit: { measure: 'wall', minutes: 17 * 60 + 30 } }));
  assert.equal(wall.code, 0, 'exactly 17h 30m on the wall');
  assert.equal((await reportOf(night, TEAM, configWith({ firstReviewLimit: { measure: 'wall', minutes: 17 * 60 + 29 } }))).code, 1);
});

test('a weekend counts on the wall and not in working hours', async () => {
  const r = await reportOf(pullsFile([pull(1, 'ana', at(4, '16:00'))], { 1: [review('bo', 'APPROVED', at(7, '10:00'))] }));
  assert.deepEqual([pullOf(r, 1).firstReview.wallMinutes, pullOf(r, 1).firstReview.workingMinutes], [66 * 60, 120]);
});

test('the working hours are those of the reviewer in their own zone, and move with their clocks', async () => {
  const forward = changeDay('America/New_York', DAY0, 1);
  const before = mondayFrom(forward.day - 7);
  const after = mondayFrom(forward.day);
  const team = teamWith([person('ana', 'Europe/Berlin'), person('ben', 'America/New_York')]);
  const file = pullsFile([pull(1, 'ana', at(before, '12:00', true)), pull(2, 'ana', at(after, '12:00', true))], { 1: [review('ben', 'COMMENTED', at(before, '15:00', true))], 2: [review('ben', 'COMMENTED', at(after, '15:00', true))] });
  const r = await reportOf(file, team);
  assert.equal(pullOf(r, 1).firstReview.workingMinutes, 60, 'before the change ben starts at 14:00Z');
  assert.equal(pullOf(r, 2).firstReview.workingMinutes, 120, 'after it he starts at 13:00Z');
  assert.deepEqual(r.clockChanges.map((c) => [c.zone, c.before, c.after]), [['America/New_York', 'UTC-05:00', 'UTC-04:00']]);
  assert.deepEqual(r.pairs.map((x) => [x.authorZone, x.reviewerZone, x.count]), [['Europe/Berlin', 'America/New_York', 2]]);
});

test('reviews by the author, in any case, by bots, never submitted, or before the pull was ready are not a first review', async () => {
  const team = teamWith([person('ana'), person('bo'), person('cy')]);
  const file = pullsFile([pull(1, 'ana', at(0, '09:00'), { draft: false })], {
    1: [
      review('ANA', 'COMMENTED', at(0, '09:10')),
      review('lint[bot]', 'COMMENTED', at(0, '09:20'), 'Bot'),
      review('release-helper', 'COMMENTED', at(0, '09:25')),
      review('cy', 'PENDING', undefined),
      review('cy', 'COMMENTED', at(0, '10:00'))
    ]
  });
  const r = await reportOf(file, team, configWith({ bots: ['release-helper'] }));
  assert.equal(pullOf(r, 1).firstReview.by, 'cy');
  assert.deepEqual(pullOf(r, 1).skippedReviews, { author: 1, bot: 2, pending: 1 });
  const draft = await reportOf(pullsFile([pull(2, 'ana', at(0, '09:00'))], { 2: [review('bo', 'COMMENTED', at(0, '09:30')), review('cy', 'APPROVED', at(0, '12:00'))] }, { 2: [event('ready_for_review', at(0, '11:00'))] }), team);
  assert.deepEqual(pullOf(draft, 2).firstReview, { by: 'cy', zone: 'UTC', state: 'APPROVED', wallMinutes: 60, workingMinutes: 60, at: 'day 0 (Mon) 12:00Z' });
  assert.deepEqual(pullOf(draft, 2).skippedReviews, { 'before-ready': 1 });
  assert.equal(pullOf(draft, 2).startedAsDraft, true);
  assert.ok(draft.notes.some((n) => n === 'not a first review: 1 review submitted before the pull request was first ready for review'));
  assert.deepEqual(SKIPPED_REVIEWS.map((s) => s.kind), ['author', 'bot', 'pending', 'no-user', 'before-ready', 'outside-team']);
});

test('a dismissed approval is not an approval, and a review with no user is skipped', async () => {
  const r = await reportOf(pullsFile([pull(1, 'ana', at(0, '09:00'))], { 1: [review(null, 'COMMENTED', at(0, '09:30')), review('bo', 'DISMISSED', at(0, '10:00')), review('bo', 'APPROVED', at(0, '13:00'))] }));
  assert.equal(pullOf(r, 1).firstReview.state, 'DISMISSED');
  assert.equal(pullOf(r, 1).firstReview.wallMinutes, 60);
  assert.equal(pullOf(r, 1).firstApproval.wallMinutes, 240);
  assert.deepEqual(pullOf(r, 1).skippedReviews, { 'no-user': 1 });
});

test('pulls by bots, with no author, by logins outside the team, or never ready are left out with a note', async () => {
  const file = pullsFile([
    pull(1, 'deps[bot]', at(0, '09:00'), { authorType: 'Bot' }),
    pull(2, null, at(0, '09:00')),
    pull(3, 'guest', at(0, '09:00')),
    pull(4, 'ana', at(0, '09:00'), { draft: true }),
    pull(5, 'ana', at(0, '09:00'))
  ], { 5: [review('bo', 'COMMENTED', at(0, '10:00'))] });
  const r = await reportOf(file, TEAM, configWith({ unknownLogins: 'exclude' }));
  assert.deepEqual(r.pulls.map((p) => p.number), [5]);
  assert.deepEqual(r.counts.excluded, { bot: 1, 'no-author': 1, 'outside-team': 1, 'never-ready': 1 });
  assert.deepEqual(r.notes.slice(0, 4), [
    'left out: 1 pull request opened by a bot: #1',
    'left out: 1 pull request with no author (user is null): #2',
    'left out: 1 pull request opened by a login that is not in the team file: #3',
    'left out: 1 pull request never ready for review (still a draft): #4'
  ]);
  assert.deepEqual(EXCLUDED.map((e) => e.kind), ['bot', 'no-author', 'outside-team', 'never-ready']);
});

test('a login outside the team stops the run by default, as author or as reviewer; exclude leaves it out', async () => {
  const author = await run(filesWith(pullsFile([pull(1, 'guest', at(0, '09:00'))])));
  assert.equal(author.code, 2);
  assert.match(author.err, /pulls\.json: pulls\[0\]\.user\.login: guest, the author of #1, is not in the team file; add the login, list it under bots, or set "unknownLogins": "exclude"/);
  const reviewer = await run(filesWith(pullsFile([pull(1, 'ana', at(0, '09:00'))], { 1: [review('guest', 'COMMENTED', at(0, '10:00'))] })));
  assert.equal(reviewer.code, 2);
  assert.match(reviewer.err, /reviews\.1\[0\]\.user\.login: guest, a reviewer of #1, is not in the team file/);
  const r = await reportOf(pullsFile([pull(1, 'ana', at(0, '09:00'))], { 1: [review('guest', 'COMMENTED', at(0, '10:00')), review('bo', 'COMMENTED', at(0, '12:00'))] }), TEAM, configWith({ unknownLogins: 'exclude' }));
  assert.equal(pullOf(r, 1).firstReview.by, 'bo');
  assert.deepEqual(pullOf(r, 1).skippedReviews, { 'outside-team': 1 });
});

test('a pull closed with no review waited until it was closed, in the hours of anyone else of the team', async () => {
  const team = teamWith([person('ana'), person('bo', 'UTC', { 'mon-fri': ['09:00-10:00'] }), person('cy', 'UTC', { 'mon-fri': ['12:00-13:00'] })]);
  const r = await reportOf(pullsFile([pull(1, 'ana', at(0, '08:00'), { state: 'closed', closed_at: at(0, '18:00') })]), team);
  assert.deepEqual(pullOf(r, 1).unreviewed, { kind: 'closed', end: 'day 0 (Mon) 18:00Z', wallMinutes: 600, workingMinutes: 120 });
  assert.equal(pullOf(r, 1).late, false, 'bo and cy worked 120 minutes while it waited');
  const late = await reportOf(pullsFile([pull(1, 'ana', at(0, '08:00'), { state: 'closed', closed_at: at(1, '09:01') })]), team);
  assert.deepEqual(late.late.map((l) => [l.kind, l.by, l.workingMinutes]), [['closed-unreviewed', null, 121]]);
  assert.equal(late.counts.closedUnreviewed, 1);
});

test('an open pull with no review is measured only with --as-of; without it a note says so and it is never past the limit', async () => {
  const file = pullsFile([pull(1, 'ana', at(0, '09:00')), merged(2, 'bo', at(0, '09:00'), at(2, '12:00'))], { 2: [review('ana', 'APPROVED', at(0, '10:00'))] });
  const plain = await reportOf(file);
  assert.equal(plain.code, 0);
  assert.deepEqual(pullOf(plain, 1).unreviewed, { kind: 'open', end: null });
  assert.ok(plain.notes.includes('1 open pull request has no review yet (#1); give --as-of to measure its wait'));
  const latest = await reportOf(file, TEAM, CONFIG, ['--as-of', 'latest']);
  assert.equal(latest.code, 1);
  assert.deepEqual(pullOf(latest, 1).unreviewed, { kind: 'as-of', end: 'day 2 (Wed) 12:00Z', wallMinutes: 51 * 60, workingMinutes: 8 * 60 + 8 * 60 + 3 * 60 });
  assert.equal(latest.asOf, 'day 2 (Wed) 12:00Z');
});

test('--as-of: latest, or a timestamp no earlier than the last moment of the file', async () => {
  const file = pullsFile([pull(1, 'ana', at(0, '09:00'))]);
  const later = await reportOf(file, TEAM, CONFIG, ['--as-of', at(0, '10:00')]);
  assert.equal(pullOf(later, 1).unreviewed.wallMinutes, 60);
  assert.equal(later.code, 0);
  const early = await run(filesWith(file), [...ARGS, '--as-of', at(0, '08:00')]);
  assert.equal(early.code, 2);
  assert.match(early.err, /--as-of .* comes before the last moment in the pull request file; give a later moment, or latest/);
  const bad = await run(filesWith(file), [...ARGS, '--as-of', 'now']);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /--as-of now is not latest or a timestamp written YYYY-MM-DDTHH:MM:SSZ/);
});

test('the hours a pull was closed before it was reopened, or a draft again, are not waiting', async () => {
  const r = await reportOf(pullsFile([pull(1, 'ana', at(0, '09:00'))], { 1: [review('bo', 'COMMENTED', at(1, '11:00'))] }, { 1: [event('closed', at(0, '10:00')), event('reopened', at(1, '10:00'))] }));
  assert.deepEqual([pullOf(r, 1).firstReview.wallMinutes, pullOf(r, 1).firstReview.workingMinutes], [120, 120]);
});

test('per author zone and reviewer zone: count, median and the percentile of the configuration by nearest rank', async () => {
  const team = teamWith([person('ana'), person('bo'), person('kai', 'Asia/Tokyo', { 'mon-fri': ['18:00-24:00'] })]);
  const waits = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const pulls = waits.map((_, i) => pull(i + 1, 'ana', at(0, '09:00')));
  const reviews = Object.fromEntries(waits.map((w, i) => [i + 1, [review('bo', 'COMMENTED', at(0, `${String(9 + Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`))]]));
  pulls.push(pull(11, 'kai', at(0, '09:00')));
  reviews[11] = [review('ana', 'COMMENTED', at(0, '09:30'))];
  const r = await reportOf(pullsFile(pulls, reviews), team, configWith({ firstReviewLimit: { measure: 'wall', minutes: 600 }, percentile: 90 }));
  assert.deepEqual(r.pairs.map((x) => [x.authorZone, x.reviewerZone, x.count, x.wall.median, x.wall.upper, x.wall.max]), [['Asia/Tokyo', 'UTC', 1, 30, 30, 30], ['UTC', 'UTC', 10, 50, 90, 100]]);
  assert.equal(r.percentile, 90);
  const first = r.overall.find((o) => o.metric === 'first-review');
  assert.deepEqual([first.count, first.wall.median, first.wall.upper, first.wall.max], [11, 50, 90, 100], 'eleven waits: the median is the 6th, the 90th percentile the 10th');
  const p95 = await reportOf(pullsFile(pulls, reviews), team, configWith({ firstReviewLimit: { measure: 'wall', minutes: 600 }, percentile: 95 }));
  assert.equal(p95.pairs[1].wall.upper, 100, 'the 95th percentile of ten is the 10th');
});

test('a run with nothing to measure gives no verdict', async () => {
  const r = await run(filesWith(pullsFile([pull(1, 'ana', at(0, '09:00'), { draft: true })])));
  assert.equal(r.code, 2);
  assert.match(r.err, /no pull request to measure: all 1 pull request is left out \(never ready for review \(still a draft\)\); a run with nothing measured gives no verdict/);
  const empty = await run(filesWith({ pulls: [], reviews: {} }));
  assert.equal(empty.code, 2);
  assert.match(empty.err, /pulls\.json: pulls is an empty list; there is nothing to measure/);
});

test('days off take out the hours of the reviewer', async () => {
  const team = teamWith([person('ana'), person('bo', 'UTC', undefined, { daysOff: [`${at(1).slice(0, 10)}`] })]);
  const r = await reportOf(pullsFile([pull(1, 'ana', at(0, '16:00'))], { 1: [review('bo', 'COMMENTED', at(2, '10:00'))] }), team);
  assert.equal(pullOf(r, 1).firstReview.workingMinutes, 120, 'one hour on day 0, none on the day off, one on day 2');
});

test('events that contradict the pull request stop the run, with the pull named', async () => {
  const r = await run(filesWith(pullsFile([pull(1, 'ana', at(0, '09:00'), { draft: true })], {}, { 1: [event('ready_for_review', at(0, '10:00'))] })));
  assert.equal(r.code, 2);
  assert.match(r.err, /pulls\.json: #1: the events leave the pull request ready for review, but its draft flag is true; give the whole list of its issue events/);
});

test('a shift at a local time the clocks skip or repeat gets a note with its day', async () => {
  const forward = changeDay('Europe/Berlin', DAY0, 1);
  const back = changeDay('Europe/Berlin', forward.day, -1);
  const day = weekdayKey;
  const team = teamWith([person('ana'), person('kai', 'Europe/Berlin', { [day(forward.day)]: ['02:30-06:00'], ...(day(back.day) === day(forward.day) ? {} : { [day(back.day)]: ['02:30-06:00'] }) })]);
  const file = pullsFile([pull(1, 'ana', at(forward.day - 1, '09:00', true)), pull(2, 'ana', at(back.day, '09:00', true))], { 1: [review('kai', 'COMMENTED', at(forward.day, '05:00', true))], 2: [review('kai', 'COMMENTED', at(back.day, '10:00', true))] });
  const r = await reportOf(file, team, configWith({ firstReviewLimit: { measure: 'wall', minutes: 100000 } }));
  assert.ok(r.notes.some((n) => /^Europe\/Berlin: 02:30 on day \d+ \(Sun\) does not exist, the clocks skip it; the shift of kai is read at 02:30 on the clock before the change$/.test(n)), r.notes.join('\n'));
  assert.ok(r.notes.some((n) => /^Europe\/Berlin: 02:30 on day \d+ \(Sun\) happens twice, the clocks pass it again; the shift of kai is read at the first of the two$/.test(n)), r.notes.join('\n'));
});
