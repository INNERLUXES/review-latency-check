// Runs the example of the README, checks that it reports what the README shows, and writes the reports of the made-up
// team to examples/output. CI runs it and then fails if those files changed, so the example output in the repository is
// always the real output.
//
// No file of the repository holds a date (docs/decisions/0001), but the pull request file the tool reads holds
// timestamps, as GitHub writes them. So the example pull requests are kept in examples/pulls-plan.json with each moment
// written as a day number counted from the first day of the example and a UTC time ("3 14:30" is 14:30Z on day 3), and
// this script turns the plan into a pull request file in the shape of the GitHub REST API, with real timestamps computed
// when it runs from the day number EXAMPLE_FROM. It writes that file, with copies of examples/team.json and
// examples/config.json, into a temporary folder, runs the tool there, and removes the folder. The reports label every
// moment by its distance from the first day (--time-labels offset), so they hold no date either.
//
//   node tools/example.mjs                 run the example, check it, and write examples/output
//   node tools/example.mjs --write <dir>   only write pulls.json, team.json and config.json into <dir>, to run the tool
//                                          on them by hand

import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dateOfDay, main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The first day of the example as a day number (whole days since the Unix epoch): a Monday shortly before New York
// moves its clocks forward, three weeks before Berlin does. Bogota keeps its clocks all year.
export const EXAMPLE_FROM = 20514;

// The arguments of the example, run in the folder that prepare() fills.
export const ARGS = ['--pulls', 'pulls.json', '--team', 'team.json', '--config', 'config.json', '--as-of', 'latest', '--time-labels', 'offset'];

// A moment of the plan, "D HH:MM", as a GitHub timestamp, for an example that starts on the day number from.
export function stampOf(moment, from = EXAMPLE_FROM) {
  const m = /^(\d{1,3}) (\d{2}):(\d{2})$/.exec(moment);
  if (!m) throw new Error(`examples/pulls-plan.json: ${moment} is not a moment written "D HH:MM"`);
  return `${dateOfDay(from + Number(m[1]))}T${m[2]}:${m[3]}:00Z`;
}

const user = (login, type = 'User') => ({ login, id: 0, type, site_admin: false });

// The plan turned into a pull request file in the shape of the GitHub REST API: { pulls, reviews, events }. Each pull
// also carries fields the tool does not read (a title, a body, requested reviewers, updated_at), as real files do.
export function buildPulls(plan, from = EXAMPLE_FROM) {
  const pulls = [];
  const reviews = {};
  const events = {};
  let id = 1000;
  for (const p of plan.pulls) {
    const at = (m) => stampOf(m, from);
    const ends = [p.opened, ...(p.merged ? [p.merged] : []), ...(p.closed ? [p.closed] : []), ...p.reviews.filter((r) => r[2]).map((r) => r[2])];
    const last = ends.map(at).sort().at(-1);
    const closedAt = p.merged ?? p.closed ?? null;
    pulls.push({
      number: p.number,
      title: `Example change ${p.number}`,
      state: closedAt ? 'closed' : 'open',
      user: user(p.author, p.authorType ?? 'User'),
      body: null,
      created_at: at(p.opened),
      updated_at: last,
      closed_at: closedAt ? at(closedAt) : null,
      merged_at: p.merged ? at(p.merged) : null,
      requested_reviewers: [],
      draft: p.draft === true
    });
    reviews[p.number] = p.reviews.map(([login, state, moment, type]) => {
      id += 1;
      return { id, user: user(login, type ?? 'User'), body: '', state, ...(moment ? { submitted_at: at(moment) } : {}), commit_id: null, author_association: 'MEMBER' };
    });
    if (!p.noEvents) {
      const list = [...(p.events ?? [])];
      if (p.merged) list.push(['merged', p.merged], ['closed', p.merged]);
      else if (p.closed) list.push(['closed', p.closed]);
      events[p.number] = list.map(([event, moment]) => {
        id += 1;
        return { id, event, actor: user(p.author), commit_id: null, created_at: at(moment) };
      });
    }
  }
  return { pulls, reviews, events };
}

// Writes pulls.json, team.json and config.json of the example into a folder.
export async function prepare(dir, from = EXAMPLE_FROM) {
  const plan = JSON.parse(await readFile(resolve(root, 'examples/pulls-plan.json'), 'utf8'));
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'pulls.json'), `${JSON.stringify(buildPulls(plan, from), null, 2)}\n`);
  await copyFile(resolve(root, 'examples/team.json'), resolve(dir, 'team.json'));
  await copyFile(resolve(root, 'examples/config.json'), resolve(dir, 'config.json'));
}

// Runs the tool on the example in a temporary folder, with the arguments given, and removes the folder.
export async function runExample(extra = [], args = ARGS) {
  const dir = await mkdtemp(resolve(tmpdir(), 'review-latency-check-example-'));
  try {
    await prepare(dir);
    let out = '';
    let err = '';
    const code = await main([...args, ...extra], { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
    return { code, out, err };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// What the README says of the example: the counts, the clock changes, the pull requests past the limit, the near miss
// of #125 (exactly four working hours, which is not past a limit of four hours), and the result.
export const EXPECTED = [
  'pulls: 40 read, 36 measured: 34 reviewed, 1 closed with no review, 1 open with no review; 33 approved, 33 merged; 4 left out',
  'clock changes: America/New_York from UTC-05:00 to UTC-04:00 on day 6 (Sun); Europe/Berlin from UTC+01:00 to UTC+02:00 on day 27 (Sun)',
  '#111  jonas-k (Europe/Berlin), first review by ben-ny (America/New_York) at day 4 (Fri) 21:00Z',
  '#119  maya-ny (America/New_York), no review, closed at day 11 (Fri) 19:00Z',
  '#127  andres-co (America/Bogota), no review, still open at --as-of day 32 (Fri) 18:00Z',
  '#125   maya-ny    ready day 14 (Mon) 13:00Z  review andres-co 6h 00m / 4h 00m',
  'note: left out: 2 pull requests opened by a bot: #109 and #130',
  'RESULT: FAIL - 6 of 36 pull requests waited longer than 4h 00m of working hours for a first review'
];
export const UNWANTED = ['RESULT: PASS', '#125*', '  #109 ', '  #117 ', '  #128 ', '  #130 '];

// The sections of the report that the README shows in full, and the pull whose --explain lines it shows.
export const SECTIONS = ['Past the limit (6)', 'First review by author zone and reviewer zone (wall / working hours of the reviewer)', 'Every measured pull together', 'Every pull (wall / working; * past the limit)'];
export const EXPLAIN_SAMPLE = '  #123*';

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--write');
  if (at > 0) {
    const dir = process.argv[at + 1];
    if (!dir) {
      console.error('example: give a folder after --write');
      process.exit(2);
    }
    await prepare(resolve(dir));
    console.log(`example: wrote pulls.json, team.json and config.json to ${dir}`);
    process.exit(0);
  }

  const full = await runExample();
  process.stdout.write(full.out);
  expect('example team', full, 1, EXPECTED, UNWANTED);

  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const lines = full.out.split('\n');
  const head = lines.slice(0, lines.indexOf('')).join('\n');
  if (!readme.includes(head)) problems.push('README: the head of the sample output differs from a real run');
  for (const title of SECTIONS) {
    const i = lines.indexOf(title);
    const block = lines.slice(i, lines.indexOf('', i + 2)).join('\n');
    if (i < 0 || !readme.includes(block)) problems.push(`README: the section "${title}" differs from a real run`);
  }
  if (!readme.includes(`node bin/review-latency-check.js ${ARGS.join(' ')}`)) problems.push('README: the command of the example differs from tools/example.mjs');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/report.txt'), full.out);
  const explain = await runExample(['--explain']);
  if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
  const explainLines = explain.out.split('\n');
  const sample = explainLines.findIndex((l) => l.startsWith(EXPLAIN_SAMPLE));
  if (sample < 0 || !readme.includes(explainLines.slice(sample, sample + 11).join('\n'))) problems.push('README: the --explain sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/report-explain.txt'), explain.out);
  for (const [format, name] of [['markdown', 'report.md'], ['json', 'report.json']]) {
    const r = await runExample(['--format', format, '--explain']);
    if (r.code !== 1) problems.push(`${format}: exit code ${r.code}, expected 1`);
    await writeFile(resolve(root, 'examples/output', name), r.out);
  }

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
