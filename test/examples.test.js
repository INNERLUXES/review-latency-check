import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, readPulls } from '../src/index.js';
import { ARGS, EXAMPLE_FROM, EXPECTED, UNWANTED, buildPulls, prepare, runExample, stampOf } from '../tools/example.mjs';
import { DAY0, isoDay } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const plan = async () => JSON.parse(await readFile(resolve(root, 'examples/pulls-plan.json'), 'utf8'));

test('examples: the plan is turned into a pull request file in the shape of the GitHub REST API, with timestamps made at run time', async () => {
  assert.equal(EXAMPLE_FROM, DAY0);
  assert.equal(stampOf('3 14:30'), `${isoDay(DAY0 + 3)}T14:30:00Z`);
  assert.throws(() => stampOf('3 14:30:00'), /is not a moment written "D HH:MM"/);
  const file = buildPulls(await plan());
  assert.deepEqual(Object.keys(file), ['pulls', 'reviews', 'events']);
  assert.equal(file.pulls.length, 40);
  const p = file.pulls.find((x) => x.number === 107);
  assert.equal(p.created_at, `${isoDay(DAY0 + 2)}T09:00:00Z`);
  assert.deepEqual(file.events[107].map((e) => e.event), ['ready_for_review', 'merged', 'closed']);
  assert.equal(file.events[133], undefined, '#133 has no list of issue events');
  assert.equal(file.reviews[118][0].submitted_at, undefined, 'a PENDING review has no submitted_at');
  const { pulls } = readPulls(JSON.stringify(file), 'pulls.json');
  assert.equal(pulls.length, 40, 'the tool reads the file it makes');
});

test('examples: the made-up team fails with the reports that are saved in examples/output', async () => {
  const r = await runExample();
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('report.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
  assert.equal((await runExample(['--explain'])).out, await saved('report-explain.txt'));
  assert.equal((await runExample(['--format', 'markdown', '--explain'])).out, await saved('report.md'));
  assert.equal((await runExample(['--format', 'json', '--explain'])).out, await saved('report.json'));
});

test('examples: each pull past the limit, for the reason the README gives', async () => {
  const report = JSON.parse((await runExample(['--format', 'json'])).out);
  assert.deepEqual(report.late.map((l) => [l.number, l.kind]), [[111, 'review'], [116, 'review'], [119, 'closed-unreviewed'], [123, 'review'], [127, 'open-unreviewed'], [138, 'review']]);
  const p = (n) => report.pulls.find((x) => x.number === n);
  assert.deepEqual([p(110).firstReview.wallMinutes, p(110).firstReview.workingMinutes], [59 * 60 + 20, 20], 'a weekend on the wall, twenty minutes of work');
  assert.deepEqual([p(125).firstReview.workingMinutes, p(125).late], [240, false], 'exactly the limit is not past it');
  assert.equal(p(107).startedAsDraft, true);
  assert.equal(p(115).firstReview.wallMinutes, 90, 'the night as a draft again is not waiting');
  assert.deepEqual(report.counts.excluded, { bot: 2, 'no-author': 0, 'outside-team': 1, 'never-ready': 1 });
  assert.deepEqual(report.counts.skippedReviews, { author: 1, bot: 1, pending: 1, 'no-user': 0, 'before-ready': 1, 'outside-team': 1 });
  assert.deepEqual(report.clockChanges.map((c) => `${c.zone} ${c.label}`), ['America/New_York day 6 (Sun)', 'Europe/Berlin day 27 (Sun)']);
});

test('examples: the same files written with CRLF line ends give the same reports', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'review-latency-check-crlf-'));
  try {
    await prepare(dir);
    for (const name of ['pulls.json', 'team.json', 'config.json']) {
      const text = (await readFile(resolve(dir, name), 'utf8')).split('\r\n').join('\n');
      await writeFile(resolve(dir, name), text.split('\n').join('\r\n'));
    }
    let out = '';
    const code = await main([...ARGS, '--explain'], { out: (t) => { out += t; }, err: () => {} }, undefined, dir);
    assert.equal(code, 1);
    assert.equal(out, await saved('report-explain.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
