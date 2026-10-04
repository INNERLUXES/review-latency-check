import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CHECK, METRICS, USAGE, VERSION, buildReport, guardFormula, limitText, mdCell, metricById, minutesText, parseArgs, spanText, toJson, toMarkdown, toText } from '../src/index.js';
import { ARGS, CONFIG, DAY0, TEAM, at, cli, configWith, filesWith, isoDay, json, merged, ms, person, pull, pullsFile, review, run, teamWith, withFiles } from './helpers.js';

const YEAR = /\b(?:19|20)\d{2}\b/;
const FILE = pullsFile([merged(1, 'ana', at(0, '08:00'), at(0, '16:00')), pull(2, 'bo', at(0, '09:00'))], { 1: [review('bo', 'APPROVED', at(0, '11:00'))], 2: [review('ana', 'COMMENTED', at(0, '10:30'))] });
const report = (labels = 'offset', file = FILE, team = TEAM, config = CONFIG, extra = {}) => buildReport({ pullsText: json(file), teamText: json(team), configText: json(config), files: { pulls: 'pulls.json', team: 'team.json', config: 'config.json' }, labels, version: VERSION, ...extra });

test('cli: --help and --version', async () => {
  for (const flag of ['--help', '-h']) {
    const r = await cli([flag]);
    assert.equal(r.code, 0);
    assert.equal(r.out, USAGE);
  }
  const v = await cli(['--version']);
  assert.equal(v.code, 0);
  assert.equal(v.out, `${VERSION}\n`);
  assert.equal(VERSION, '1.0.0');
  for (const s of ['--pulls <file>', '--team <file>', '--config <file>', '--as-of <moment>', '--time-labels <kind>', '--format <name>', '--explain', '--out <file>', 'Waits: first-review, first-approval, merge. Check: first-review-limit.', 'Exit codes: 0 no pull request waited past the limit, 1 some did, 2 usage or input error.']) assert.ok(USAGE.includes(s), s);
  assert.deepEqual(METRICS.map((m) => m.id), ['first-review', 'first-approval', 'merge']);
  assert.equal(metricById('merge').hoursOf, 'the author');
  assert.equal(CHECK.id, 'first-review-limit');
});

test('cli: usage errors give exit code 2 with the usage, and nothing on standard output', async () => {
  const cases = [
    [[], /give the pull request file with --pulls <file>/],
    [['--pulls', 'p.json'], /give the team file with --team <file>/],
    [['--pulls', 'p.json', '--team', 't.json'], /give the configuration with --config <file>; the limit of a first review has no default/],
    [[...ARGS, '--time-labels', 'weeks'], /unknown time labels weeks \(date, offset or iso\)/],
    [[...ARGS, '--format', 'html'], /unknown format html \(text, markdown or json\)/],
    [[...ARGS, '--team', 'b.json'], /--team was given twice/],
    [[...ARGS, '--as-of'], /--as-of needs a value/],
    [[...ARGS, '--out', '--explain'], /--out needs a value/],
    [[...ARGS, '--verbose'], /unknown argument --verbose/],
    [['pulls.json'], /unexpected argument pulls\.json; give the pull request file with --pulls pulls\.json/],
    [['--pulls', '-'], /reading from standard input is not supported/],
    [['-'], /reading from standard input is not supported/],
    [['--pulls', 'https://example.com/p.json', '--team', 't', '--config', 'c'], /give a local path; the tool never fetches a URL/]
  ];
  for (const [argv, pattern] of cases) {
    const r = await cli(argv);
    assert.equal(r.code, 2, argv.join(' '));
    assert.match(r.err, pattern, argv.join(' '));
    assert.ok(r.err.includes('Usage: review-latency-check'), 'the usage follows a usage error');
    assert.equal(r.out, '');
  }
  assert.deepEqual(parseArgs(ARGS), { pulls: 'pulls.json', team: 'team.json', config: 'config.json', asOf: null, labels: 'date', format: 'text', explain: false, out: null, help: false, version: false });
});

test('exit codes: 0 when nothing is past the limit, 1 when something is, 2 for an input problem with no verdict', async () => {
  const pass = await run(filesWith(FILE));
  assert.equal(pass.code, 0, pass.err);
  assert.match(pass.out, /RESULT: PASS - none of 2 pull requests waited longer than 2h 00m of working hours for a first review\n$/);
  const fail = await run(filesWith(FILE, TEAM, configWith({ firstReviewLimit: { measure: 'working', minutes: 119 } })));
  assert.equal(fail.code, 1);
  assert.match(fail.out, /RESULT: FAIL - 1 of 2 pull requests waited longer than 1h 59m of working hours for a first review\n$/);
  const missing = await run({ 'team.json': json(TEAM), 'config.json': json(CONFIG) });
  assert.equal(missing.code, 2);
  assert.match(missing.err, /^review-latency-check: no verdict, the input has a problem:\n {2}pulls\.json: no such file\n$/);
  assert.equal(missing.out, '');
  const all = await run({ 'pulls.json': '{', 'team.json': '[]', 'config.json': '{}' });
  assert.equal(all.code, 2);
  assert.match(all.err, /the input has 3 problems:/, 'the problems of all three files are listed together');
  assert.match(all.err, /config\.json: firstReviewLimit: is needed/);
  assert.match(all.err, /team\.json: the team file must be one JSON object, not an array/);
  assert.match(all.err, /pulls\.json: line 1, column 2: a name in double quotes was expected/);
});

test('text report: the files, the team, the limit, the counts, the late pulls, the pairs, every pull and the result', async () => {
  const r = await run(filesWith(FILE, TEAM, configWith({ firstReviewLimit: { measure: 'working', minutes: 100 } })), [...ARGS, '--time-labels', 'offset']);
  const lines = r.out.split('\n');
  assert.equal(lines[0], 'review-latency-check: pulls.json, team team.json (Test team), configuration config.json');
  assert.equal(lines[1], 'team: 2 people in 1 time zone');
  assert.equal(lines[2], '  ana  UTC  mon-fri 09:00-17:00');
  assert.ok(lines.includes('limit: a first review within 1h 40m (100 minutes) of the working hours of the reviewer'));
  assert.ok(lines.includes('percentile: p90 and the median, both by the nearest-rank method'));
  assert.ok(lines.includes('bots: every account of type Bot'));
  assert.ok(lines.includes('data: day 0 (Mon) 08:00Z to day 0 (Mon) 16:00Z'));
  assert.ok(lines.includes('clock changes: none in the data'));
  assert.ok(lines.includes('pulls: 2 read, 2 measured: 2 reviewed; 1 approved, 1 merged'));
  assert.ok(lines.includes('Past the limit (1)'));
  assert.ok(lines.some((l) => l.startsWith('  #1  ana (UTC), first review by bo (UTC) at day 0 (Mon) 11:00Z') && l.endsWith('3h 00m on the wall, 2h 00m working')));
  assert.ok(lines.some((l) => /^ {2}UTC +UTC +2 +1h 30m +3h 00m +3h 00m +1h 30m +2h 00m +2h 00m$/.test(l)), r.out);
  assert.ok(lines.some((l) => /^ {2}#1\* +ana +ready day 0 \(Mon\) 08:00Z +review bo 3h 00m \/ 2h 00m +approval 3h 00m \/ 2h 00m +merge 8h 00m \/ 7h 00m$/.test(l)), r.out);
  assert.equal(lines.at(-2), 'RESULT: FAIL - 1 of 2 pull requests waited longer than 1h 40m of working hours for a first review');
});

test('--explain shows the spans behind each number, and the sentences the measures rest on', async () => {
  const r = await run(filesWith(FILE), [...ARGS, '--time-labels', 'offset', '--explain']);
  for (const l of [
    '      ready for review and open: day 0 (Mon) 08:00Z-16:00Z (no issue events given)',
    '      first review: bo (UTC), APPROVED, at day 0 (Mon) 11:00Z',
    '        on the wall: day 0 (Mon) 08:00Z-11:00Z = 3h 00m',
    '        working hours of bo (UTC, UTC+00:00 at the start): day 0 (Mon) 09:00Z-11:00Z = 2h 00m',
    '      merge: at day 0 (Mon) 16:00Z',
    '        working hours of the author ana (UTC, UTC+00:00 at the start): day 0 (Mon) 09:00Z-16:00Z = 7h 00m',
    '      ready for review and open: from day 0 (Mon) 09:00Z, still open (no issue events given)'
  ]) assert.ok(r.out.includes(`${l}\n`), l);
  assert.match(r.out, /\nBasis\n\n {2}"A draft pull request was marked as ready for review\." \(ready_for_review, https:\/\/docs\.github\.com\/en\/rest\/using-the-rest-api\/issue-event-types\)\n/);
  const md = await run(filesWith(FILE), [...ARGS, '--format', 'markdown', '--explain']);
  assert.match(md.out, /### The moments behind each number/);
  assert.match(md.out, /#### #1 by ana\n\n- ready for review and open: /);
});

test('time labels: date has no year, offset has no date, iso has full timestamps; the same numbers in each', async () => {
  const kinds = {};
  for (const labels of ['date', 'offset', 'iso']) kinds[labels] = await run(filesWith(FILE), [...ARGS, '--time-labels', labels, '--format', 'json']);
  const y = isoDay(DAY0).slice(0, 4);
  assert.ok(!kinds.date.out.includes(y), 'no year with date labels');
  assert.ok(!kinds.offset.out.includes(y), 'no year with offset labels');
  assert.doesNotMatch(kinds.offset.out, /\d{4}-\d{2}-\d{2}/);
  assert.ok(kinds.iso.out.includes(`"at": "${at(0, '11:00')}"`));
  const strip = (o) => JSON.stringify(JSON.parse(o), (k, v) => (['at', 'ready', 'end', 'first', 'last', 'labels', 'label', 'asOf'].includes(k) ? undefined : v));
  assert.equal(strip(kinds.date.out), strip(kinds.offset.out));
  assert.equal(strip(kinds.iso.out), strip(kinds.offset.out));
  assert.equal(spanText(ms(0, '08:00'), ms(0, '09:30'), 'offset', DAY0), 'day 0 (Mon) 08:00Z-09:30Z');
  assert.equal(spanText(ms(0, '08:00'), ms(1, '09:30'), 'offset', DAY0), 'day 0 (Mon) 08:00Z-day 1 (Tue) 09:30Z');
  assert.equal(spanText(ms(0, '08:00'), Infinity, 'offset', DAY0), 'from day 0 (Mon) 08:00Z, still open');
});

test('json report: every number, and the explain lines and the basis only with --explain', async () => {
  const plain = JSON.parse((await run(filesWith(FILE), [...ARGS, '--format', 'json'])).out);
  assert.equal(plain.tool, 'review-latency-check');
  assert.equal(plain.version, VERSION);
  assert.deepEqual(plain.files, { pulls: 'pulls.json', team: 'team.json', config: 'config.json' });
  assert.deepEqual(plain.limit, { measure: 'working', minutes: 120, text: limitText({ measure: 'working', minutes: 120 }) });
  assert.equal(plain.basis, undefined);
  assert.equal(plain.pulls[0].explain, undefined);
  assert.deepEqual(Object.keys(plain.counts), ['read', 'measured', 'reviewed', 'approved', 'merged', 'closedUnreviewed', 'openUnreviewed', 'late', 'excluded', 'skippedReviews']);
  assert.deepEqual(plain.verdict, { pass: true, text: 'PASS - none of 2 pull requests waited longer than 2h 00m of working hours for a first review' });
  const full = JSON.parse((await run(filesWith(FILE), [...ARGS, '--format', 'json', '--explain'])).out);
  assert.ok(full.basis.length >= 5);
  assert.ok(full.pulls[0].explain.length >= 4);
  assert.match(limitText({ measure: 'wall', minutes: 90 }), /^a first review within 1h 30m \(90 minutes\) on the clock on the wall$/);
});

test('markdown report: tables, escaped cells and formulas guarded', async () => {
  assert.equal(guardFormula('=HYPERLINK("x")'), `'=HYPERLINK("x")`);
  assert.equal(guardFormula('+1'), "'+1");
  assert.equal(guardFormula('ana'), 'ana');
  assert.equal(mdCell('a|b*c_d[e]`f`<g>&\\'), 'a\\|b\\*c\\_d\\[e\\]\\`f\\`&lt;g&gt;&amp;\\\\');
  assert.equal(mdCell('-x\ny'), "'-x y");
  assert.equal(minutesText(null), '-');
  assert.equal(minutesText(61), '1h 01m');
  const md = toMarkdown(report('offset', FILE, teamWith([person('ana'), person('bo')], { name: '=cmd|x' })));
  assert.match(md, /^## review-latency-check: PASS - none of 2 pull requests/);
  assert.ok(md.includes('- Files: pulls.json, team team.json (=cmd\\|x), configuration config.json'), 'the pipe of the team name is escaped');
  assert.match(md, /\| Login \| Time zone \| Working hours \(local time\) \|/);
  assert.match(md, /\| UTC \| UTC \| 2 \| 1h 30m \| 3h 00m \| 3h 00m \| 1h 30m \| 2h 00m \| 2h 00m \|/);
  assert.match(md, /\| #1 \| ana \| day 0 \(Mon\) 08:00Z \| bo 3h 00m \/ 2h 00m \| 3h 00m \/ 2h 00m \| 8h 00m \/ 7h 00m \|/);
  assert.match(md, /### Past the limit\n\nNone\./);
  const pipes = (l) => l.split(/(?<!\\)\|/).length;
  const lines = md.split('\n');
  lines.forEach((l, i) => {
    if (l.startsWith('|') && i > 0 && lines[i - 1].startsWith('|')) assert.equal(pipes(l), pipes(lines[i - 1]), `a row with its own number of cells: ${l}`);
  });
});

test('reports: text, Markdown and JSON from one report object, with no year in any of them by default', () => {
  const r = report('date');
  for (const out of [toText(r, { explain: true }), toMarkdown(r, { explain: true }), toJson(r, { explain: true })]) assert.doesNotMatch(out, YEAR);
});

test('--out writes the report to a file, and refuses one of the inputs as its path', async () => {
  await withFiles(filesWith(FILE), async (dir) => {
    const r = await cli([...ARGS, '--out', 'report.md', '--format', 'markdown'], dir);
    assert.equal(r.code, 0);
    assert.equal(r.out, '');
    assert.match(r.err, /^review-latency-check: the report is in report\.md; PASS - none of 2 pull requests/);
    assert.match(await readFile(resolve(dir, 'report.md'), 'utf8'), /^## review-latency-check: PASS/);
    for (const input of ['pulls.json', 'team.json', 'config.json']) {
      const refused = await cli([...ARGS, '--out', input], dir);
      assert.equal(refused.code, 2);
      assert.match(refused.err, new RegExp(`${input.replace('.', '\\.')}: is one of the inputs; give --out another file`));
    }
    assert.deepEqual((await readdir(dir)).sort(), ['config.json', 'pulls.json', 'report.md', 'team.json'], 'nothing else is written');
    assert.equal(JSON.parse(await readFile(resolve(dir, 'pulls.json'), 'utf8')).pulls.length, 2, 'the input is untouched');
  });
});

test('paths in the report are relative to the folder, with forward slashes', async () => {
  const r = await run({ 'data/in/pulls.json': json(FILE), 'data/team.json': json(TEAM), 'data/config.json': json(CONFIG) }, ['--pulls', 'data/in/pulls.json', '--team', 'data/team.json', '--config', 'data/config.json']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^review-latency-check: data\/in\/pulls\.json, team data\/team\.json \(Test team\), configuration data\/config\.json\n/);
});
