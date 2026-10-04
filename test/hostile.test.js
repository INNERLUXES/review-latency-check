import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, MAX_PROBLEMS, PULL_LIMITS, parseJson, toMarkdown, buildReport } from '../src/index.js';
import { ARGS, CONFIG, DAY0, TEAM, at, cli, configWith, filesWith, json, merged, person, pull, pullsFile, review, run, teamWith, withFiles } from './helpers.js';

// Hostile input: files built to exhaust the memory or the time, to rewrite the terminal, to break a table, to be read as
// a formula, or to change how objects behave. Each test also checks the time, because work that grows faster than the
// input is a failure even when the answer is right. Tests that need a symbolic link or a device are guarded with
// process.platform, and none of them asserts a line or a column: those are asserted in the tests that run everywhere.

const LIMIT = { timeout: 180000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};

const ZONES = ['Europe/Berlin', 'America/New_York', 'America/Bogota', 'Asia/Kolkata', 'Australia/Sydney', 'Europe/Lisbon', 'Asia/Tokyo', 'America/Los_Angeles', 'Africa/Cairo', 'Pacific/Auckland'];
const pad = (n) => String(n).padStart(2, '0');

test('hostile: five thousand pull requests with three reviews each, fifty people in ten zones, over six hundred days, in seconds', LIMIT, async () => {
  const people = Array.from({ length: 50 }, (_, i) => person(`p${i}`, ZONES[i % 10], { 'mon-fri': ['08:00-12:00', '13:00-17:00'] }));
  const pulls = [];
  const reviews = {};
  for (let i = 0; i < 5000; i += 1) {
    const d = Math.floor(i / 8);
    const author = `p${i % 50}`;
    pulls.push(i % 7 === 0 ? pull(i + 1, author, at(d, `${pad(i % 24)}:05`)) : merged(i + 1, author, at(d, `${pad(i % 24)}:05`), at(d + 3, '10:00')));
    reviews[i + 1] = [review(`p${(i + 1) % 50}`, 'COMMENTED', at(d + 1, '09:00')), review(`p${(i + 2) % 50}`, 'APPROVED', at(d + 2, '09:00')), review(author, 'COMMENTED', at(d + 2, '10:00'))];
  }
  const r = await fast(() => run(filesWith({ pulls, reviews }, teamWith(people), configWith({ firstReviewLimit: { measure: 'wall', minutes: 100000 } })), [...ARGS, '--as-of', 'latest', '--format', 'json']), 60000);
  assert.equal(r.code, 0, r.err.slice(0, 500));
  const report = JSON.parse(r.out);
  assert.equal(report.counts.measured, 5000);
  assert.equal(report.counts.skippedReviews.author, 5000);
});

test('hostile: files over their size limit are refused before they are read', LIMIT, async () => {
  assert.deepEqual(LIMITS, { maxPullsBytes: 64 * 1024 * 1024, maxTeamBytes: 1024 * 1024, maxConfigBytes: 1024 * 1024 });
  const big = await fast(() => run(filesWith(pullsFile([pull(1, 'ana', at(0))]), { name: 'x'.repeat(2 * 1024 * 1024), people: [] })));
  assert.equal(big.code, 2);
  assert.match(big.err, /team\.json: [\d,]+ bytes is over the 1 MB limit/);
  const small = await run(filesWith(pullsFile([pull(1, 'ana', at(0))])), ARGS, { maxPullsBytes: 50 });
  assert.equal(small.code, 2);
  assert.match(small.err, /pulls\.json: \d+ bytes is over the 50 byte limit/);
});

test('hostile: JSON nested very deep, very long or with very many values is refused in one pass, with a short error', LIMIT, async () => {
  for (const content of ['['.repeat(500000), `{"pulls": [], "reviews": {}, "x": "${'x'.repeat(PULL_LIMITS.maxStringLength + 10)}"}`]) {
    const r = await fast(() => run({ ...filesWith(pullsFile([])), 'pulls.json': content }));
    assert.equal(r.code, 2);
    assert.ok(r.err.length < 3000, 'the error stays short');
  }
  const config = await fast(() => run({ ...filesWith(pullsFile([])), 'config.json': `{"bots": [${'"a",'.repeat(100001)}"a"]}` }));
  assert.equal(config.code, 2);
  assert.match(config.err, /more than 100000 values/);
  await fast(async () => assert.throws(() => parseJson(`[${'1,'.repeat(300000)}1]`), /more than 100000 values/));
});

test('hostile: control, escape and direction characters from the pull request file never reach a message or a report', async () => {
  const esc = String.fromCharCode(27);
  const rlo = String.fromCharCode(0x202e);
  const ls = String.fromCharCode(0x2028);
  const login = `guest${esc}[31m${rlo}${ls}x`;
  const refused = await run(filesWith(pullsFile([pull(1, login, at(0, '09:00'))])));
  assert.equal(refused.code, 2);
  for (const c of [esc, rlo, ls]) assert.ok(!refused.err.includes(c), String(c.charCodeAt(0)));
  assert.match(refused.err, /guest \[31m {2}x, the author of #1, is not in the team file/);
  for (const format of ['text', 'markdown', 'json']) {
    const r = await run(filesWith(pullsFile([pull(1, login, at(0, '09:00')), pull(2, 'ana', at(0, '09:00'))], { 2: [review(login, 'COMMENTED', at(0, '10:00')), review('bo', 'COMMENTED', at(0, '11:00'))] }), TEAM, configWith({ unknownLogins: 'exclude' })), [...ARGS, '--format', format, '--explain']);
    assert.equal(r.code, 0, r.err);
    for (const c of [esc, rlo, ls]) assert.ok(!r.out.includes(c), `${format}: ${c.charCodeAt(0)}`);
    assert.ok(!r.out.includes('guest'), `${format}: a login outside the team is never shown`);
  }
  const team = await run(filesWith(pullsFile([pull(1, 'ana', at(0))]), teamWith([person('ana')], { name: `x${esc}y` })));
  assert.equal(team.code, 2);
  assert.match(team.err, /name: must be a string of 1 to 120 characters with no control character/);
});

test('hostile: a team name that starts like a formula is guarded in the Markdown tables and lines', () => {
  const r = buildReport({ pullsText: json(pullsFile([pull(1, 'ana', at(0, '09:00'))], { 1: [review('bo', 'COMMENTED', at(0, '10:00'))] })), teamText: json(teamWith([person('ana'), person('bo')], { name: '=HYPERLINK("http://x")' })), configText: json(CONFIG), labels: 'offset' });
  const md = toMarkdown(r);
  assert.ok(md.includes('(=HYPERLINK("http://x"))'), 'inside a line it is plain text, after the file names');
  assert.ok(!md.split('\n').some((l) => l.startsWith('| =')), 'no cell starts with =');
});

test('hostile: a file with thousands of problems lists twenty and a count, quickly', LIMIT, async () => {
  const pulls = Array.from({ length: 500 }, (_, i) => pull(i + 1, 'ana', 'never'));
  const r = await fast(() => run(filesWith({ pulls, reviews: {} })));
  assert.equal(r.code, 2);
  assert.match(r.err, /the input has 21 problems:/);
  assert.ok(r.err.endsWith('\n  and 480 more\n'), r.err.slice(-200));
  assert.equal(MAX_PROBLEMS, 20);
});

test('hostile: __proto__, constructor and toString as keys and logins are only data', async () => {
  const keys = await run({ ...filesWith(pullsFile([])), 'pulls.json': '{"__proto__": {"x": 1}, "pulls": [], "reviews": {"constructor": []}}' });
  assert.equal(keys.code, 2);
  assert.match(keys.err, /__proto__: unknown key/);
  const numbers = await run({ ...filesWith(pullsFile([])), 'pulls.json': '{"pulls": [], "reviews": {"constructor": [], "__proto__": []}}' });
  assert.match(numbers.err, /reviews\.constructor: constructor is not a pull number/);
  assert.match(numbers.err, /reviews\.__proto__: __proto__ is not a pull number/);
  const login = await run(filesWith(pullsFile([pull(1, '__proto__', at(0)), pull(2, 'toString', at(0))])));
  assert.equal(login.code, 2);
  assert.match(login.err, /__proto__, the author of #1, is not in the team file/);
  assert.match(login.err, /toString, the author of #2, is not in the team file/);
  const config = await run({ ...filesWith(pullsFile([])), 'config.json': '{"__proto__": {"firstReviewLimit": {"measure": "wall", "minutes": 1}}}' });
  assert.match(config.err, /__proto__: unknown key/);
  assert.equal({}.x, undefined);
  assert.equal({}.firstReviewLimit, undefined);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
});

test('hostile: a device or a link to one is refused as not a regular file, with no line or column', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows has no /dev/zero and needs extra rights to make a symbolic link');
    return;
  }
  await withFiles(filesWith(pullsFile([])), async (dir) => {
    const device = await fast(() => cli(['--pulls', '/dev/zero', '--team', 'team.json', '--config', 'config.json'], dir));
    assert.equal(device.code, 2);
    assert.match(device.err, /not a regular file/);
    await symlink('/dev/zero', resolve(dir, 'zero.json'));
    const r = await fast(() => cli(['--pulls', 'zero.json', '--team', 'team.json', '--config', 'config.json'], dir));
    assert.equal(r.code, 2);
    assert.match(r.err, /zero\.json: not a regular file/);
  });
});

test('hostile: a link to a regular file named on the command line is read, because the person who runs the tool named it', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows needs extra rights to make a symbolic link');
    return;
  }
  await withFiles(filesWith(pullsFile([pull(1, 'ana', at(0, '09:00'))], { 1: [review('bo', 'COMMENTED', at(0, '10:00'))] }), TEAM, CONFIG, {}), async (dir) => {
    await symlink(resolve(dir, 'pulls.json'), resolve(dir, 'linked.json'));
    const r = await cli(['--pulls', 'linked.json', '--team', 'team.json', '--config', 'config.json'], dir);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^review-latency-check: linked\.json, /);
  });
  assert.ok(DAY0 > 0);
});
