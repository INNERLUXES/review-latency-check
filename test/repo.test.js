import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK, CONFIG_KEYS, EVENT_KINDS, METRICS, PERSON_KEYS, PULL_FIELDS, REVIEW_FIELDS, TEAM_KEYS } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const HOMEPAGE = 'https://innerluxes.dev/software-development/nearshore';
const DECISION = 'docs/decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md';
const docFiles = async () => ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', ...(await readdir(resolve(root, 'docs'), { recursive: true })).filter((f) => f.endsWith('.md')).map((f) => `docs/${f.split('\\').join('/')}`)];
const YEAR = /\b(?:19|20)\d{2}\b/;

// Every file of a folder of the repository, with forward slashes.
async function filesOf(dir) {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk(dir);
  return out.sort();
}

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts, the author and the homepage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'review-latency-check');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.homepage, HOMEPAGE);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.author, 'INNERLUXES <info@innerluxes.dev>');
  assert.equal(pkg.repository.url, 'git+https://github.com/INNERLUXES/review-latency-check.git');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin['review-latency-check'], 'bin/review-latency-check.js');
  for (const script of ['test', 'check', 'example', 'test:coverage']) assert.ok(pkg.scripts[script], script);
  const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.version, pkg.version);
  assert.ok((await read('bin/review-latency-check.js')).startsWith('#!/usr/bin/env node\n'));
});

test('README: one link to the nearshore page, in the closing Background section, with the agreed anchor text', async () => {
  const readme = await read('README.md');
  const parts = readme.split(/^## /m);
  const background = parts.find((p) => p.startsWith('Background'));
  assert.ok(background, 'a Background section');
  assert.ok(background.includes(`[Nearshore Software Development Services](${HOMEPAGE})`));
  assert.equal(readme.split('innerluxes.dev/').length - 1, 1, 'the README links to the site once');
  assert.equal(parts.at(-1).split('\n')[0], 'License');
  assert.equal(parts.at(-2).split('\n')[0], 'Background');
});

test('README: the npm test block shows the summary counts with no symbol in front, and they add up', async () => {
  const readme = await read('README.md');
  const block = /```\n(tests (\d+)\npass (\d+)\nfail (\d+)\nskipped (\d+))\n```/.exec(readme);
  assert.ok(block, 'the npm test block');
  const [, , tests, pass, fail, skipped] = block.map(Number);
  assert.equal(pass + fail + skipped, tests);
  assert.equal(fail, 0);
  assert.ok(tests > 100);
});

test('README: what it measures, how to run it with npx or node, the options, the example output, the limits', async () => {
  const readme = await read('README.md');
  for (const heading of ['## Quick start', '## Usage', '## What it measures', '## How the time is counted', '## The pull request file', '## The team file', '## The configuration', '## Dates', '## Privacy', '## Formats', '## Exit codes', '## Limits']) assert.ok(readme.includes(`\n${heading}\n`), heading);
  assert.match(readme, /npx --yes github:INNERLUXES\/review-latency-check/);
  assert.match(readme, /node bin\/review-latency-check\.js --pulls pulls\.json --team team\.json --config config\.json --as-of latest --time-labels offset/);
  for (const option of ['--pulls', '--team', '--config', '--as-of', '--time-labels', '--format', '--explain', '--out', '--help', '--version']) assert.ok(readme.includes(option), option);
  for (const m of METRICS) assert.ok(readme.includes(`| \`${m.id}\` |`), `README: ${m.id}`);
  assert.match(readme, /nearest-rank/);
});

test('README and documents: no date and no calendar year anywhere', async () => {
  for (const file of await docFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, /\b(?:January|February|March|April|June|July|August|September|October|November|December)\s+\d/, file);
    assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}/, file);
  }
  assert.match(await read('CHANGELOG.md'), /^## 1\.0\.0$/m);
});

test('README and documents: plain ASCII, with no emoji and no decorative character', async () => {
  for (const file of [...(await docFiles()), '.github/pull_request_template.md', '.github/CODEOWNERS', 'package.json']) {
    const text = await read(file);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
  }
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n'));
});

test('SECURITY.md: how to report, and no promise about reply times or fixes', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /info@innerluxes\.dev/);
  assert.match(text, /"review-latency-check security"/);
  assert.doesNotMatch(text, /within\s+\d|\bSLA\b|business days|within a (?:day|week)|\d+\s*(?:hours|days)\b|we will|guarantee|respond within|reply within/i);
});

test('workflows: every action is pinned to a commit, the CI runs three systems, two Node versions and coverage, and the SSDF gate is there', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, name);
    const uses = [...text.matchAll(/^\s*- uses: (\S+)/gm)].map((m) => m[1]);
    assert.ok(uses.length > 0, name);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${name}: ${u}`);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /run: npm run test:coverage/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  for (const s of [/npm ci/, /npm run check/, /npm run example/, /git diff --exit-code -- examples/]) assert.match(ci, s);
});

test('release workflow: the SSDF gate, then a tgz, a CycloneDX SBOM, SHA256SUMS and a provenance attestation named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(release, /ref: dfda194a3ed35623b8b420df05e110b66d984586 # v1\.0\.0/);
  assert.ok(release.indexOf('ssdf-repo-check.js') < release.indexOf('npm pack'), 'the gate runs before the package is made');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/review-latency-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /actions\/attest-build-provenance@/);
  assert.match(release, /tags: \['v\*'\]/);
});

test('repository files: Dependabot for actions and npm, CodeQL, CODEOWNERS, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(await read('.github/workflows/codeql.yml'), /security-extended/);
  assert.match(await read('.github/CODEOWNERS'), /^\* @innerluxesdev$/m);
  assert.match(await read('.github/CODEOWNERS'), /^\/src\/github\.js @innerluxesdev$/m);
  assert.match(await read('.github/pull_request_template.md'), /npm run example/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^examples\/\*\.json -text$/m);
  assert.match(attributes, /^examples\/output\/\*\* -text$/m);
  assert.match(await read('.gitignore'), /^\.env$/m);
});

test('the repository names no other tool of the organization outside the SSDF gate', async () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/release.yml', '.github/CODEOWNERS', '.github/pull_request_template.md', 'package.json', 'src/cli.js', 'src/check.js']) {
    assert.doesNotMatch(await read(file), /core-hours-overlap-check|access-offboarding-check|sow-gap-check|bus-factor-check|trace-matrix-check|release-gate-check/i, file);
  }
});

test('docs: every measure, key and field is described, and the documents of the set are there and linked', async () => {
  const method = await read('docs/method.md');
  for (const m of [...METRICS, CHECK]) assert.ok(method.includes(`### \`${m.id}\``), `docs/method.md: ${m.id}`);
  const inputs = await read('docs/inputs.md');
  const keys = (obj, path = '') => Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? [`${path}${k}`, ...keys(v, `${path}${k}.`)] : [`${path}${k}`]));
  for (const k of keys(CONFIG_KEYS)) assert.ok(inputs.includes(`\`${k}\``), `docs/inputs.md: ${k}`);
  for (const k of Object.keys(TEAM_KEYS)) assert.ok(inputs.includes(`| \`${k}\` |`), `docs/inputs.md: ${k}`);
  for (const k of Object.keys(PERSON_KEYS)) assert.ok(inputs.includes(`| \`people[].${k}\` |`), `docs/inputs.md: people[].${k}`);
  for (const f of PULL_FIELDS) assert.ok(inputs.includes(`| \`${f}\` |`), `docs/inputs.md: pull ${f}`);
  for (const f of REVIEW_FIELDS) assert.ok(inputs.includes(`| review \`${f}\` |`), `docs/inputs.md: review ${f}`);
  for (const e of EVENT_KINDS) assert.ok(inputs.includes(`\`${e}\``), `docs/inputs.md: ${e}`);
  const readme = await read('README.md');
  for (const f of ['docs/method.md', 'docs/rules-and-sources.md', 'docs/limits.md', 'docs/inputs.md', 'docs/secure-defaults.md', 'docs/threat-model.md', DECISION]) assert.ok(readme.includes(`(${f}`), f);
  for (const f of ['docs/inputs.md', 'docs/secure-defaults.md', 'docs/threat-model.md', DECISION, 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md']) assert.ok((await read(f)).length > 500, f);
  assert.match(await read('docs/secure-defaults.md'), /NIST SP 800-218/);
  const threats = await read('docs/threat-model.md');
  for (const t of ['formula', '__proto__', 'Markdown table', 'personal data', 'regular expression', 'clock', 'offset', 'nothing measured', 'token']) assert.match(threats, new RegExp(t.replace(/[_.]/g, '.'), 'i'), t);
  for (const t of ['nearest-rank', 'skipped', 'twice', 'the first of the two', 'on the clock before the change', 'fail closed']) assert.ok(method.includes(t), `docs/method.md: ${t}`);
});

test('src imports no network, process or code evaluation module, and calls none of them', async () => {
  const forbidden = /from 'node:(?:net|http|https|http2|dgram|dns|tls|child_process|worker_threads|cluster|vm|inspector)'|\bfetch\(|XMLHttpRequest|WebSocket\(|\beval\(|new Function\(|\brequire\(|\bimport\(/;
  for (const file of await readdir(resolve(root, 'src'))) assert.doesNotMatch(await read(`src/${file}`), forbidden, file);
});

test('src builds no regular expression from text it reads: no RegExp of a variable outside text.js', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    for (const m of text.matchAll(/new RegExp\(([^)]*)\)/g)) assert.ok(file === 'text.js', `${file}: new RegExp(${m[1]})`);
  }
});

test('src reads and writes only what it is given: the file system is used in src/files.js only, and the version in src/cli.js', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    if (file === 'files.js') {
      assert.match(text, /import \{ open \} from 'node:fs\/promises'/);
      assert.doesNotMatch(text, /(?<!handle\.)writeFile\(|appendFile|mkdir|mkdtemp|rename\(|unlink|realpath|readlink/, 'nothing but the report is written');
      assert.equal(text.split('handle.writeFile(').length, 2, 'one write, through the handle --out opened');
    } else if (file === 'cli.js') assert.match(text, /import \{ readFileSync \} from 'node:fs'/);
    else assert.doesNotMatch(text, /from 'node:fs/, file);
  }
});

test('src reads no clock, makes no Date object and no random number, and asks Intl only in src/zones.js, always with a time zone and a locale', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    assert.doesNotMatch(text, /Date\.now\(|new Date\(|performance\.now|Math\.random|process\.hrtime|getTimezoneOffset|toLocale(?:Date|Time)String|toLocaleLowerCase|toLocaleUpperCase|localeCompare|\.get(?:Hours|Minutes|Date|Day|Month|FullYear)\(|Date\.parse\(/, file);
    if (file !== 'zones.js') assert.doesNotMatch(text, /new Intl\.DateTimeFormat|Intl\.DateTimeFormat\(|formatToParts\(/, file);
  }
  const zones = await read('src/zones.js');
  const calls = [...zones.matchAll(/new Intl\.DateTimeFormat\(([^;]*)\)/g)].map((m) => m[1]);
  assert.equal(calls.length, 2);
  for (const c of calls) assert.match(c, /^'en-US', \{ timeZone: /, c);
  assert.match(zones, /formatToParts\(t\)/, 'formatToParts always gets a moment');
});

test('src reads no token and calls no API: no environment variable, no address of an API', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    assert.doesNotMatch(text, /process\.env|api\.github\.com|GITHUB_TOKEN|Authorization/, file);
  }
});

test('tests: a test file that makes a link or names a device guards it with process.platform, and a guarded test asserts no line or column', async () => {
  const files = (await readdir(resolve(root, 'test'))).filter((f) => f.endsWith('.test.js'));
  let guarded = 0;
  for (const f of files) {
    const text = await read(`test/${f}`);
    if (/symlink\(|\/dev\/(?:null|zero)/.test(text.replace(/\/\/.*$/gm, ''))) {
      assert.match(text, /process\.platform/, `${f} uses a link or a device`);
      guarded += 1;
    }
    for (const block of text.split(/\ntest\(/).filter((b) => /if \(process\.platform/.test(b))) {
      assert.doesNotMatch(block, /\.line\b|\.column\b|lineOf\(|positionOf\(|line \d|column \d|:\d+:\d+|json:\d/, `${f}: a test guarded by the system asserts a line or a column`);
    }
  }
  assert.ok(guarded >= 1);
});

test('tests: every test that is skipped on a system says why, and the guards name a system', async () => {
  for (const f of (await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.test.js'))) {
    const text = await read(`test/${f}`);
    for (const m of text.matchAll(/\bt\.skip\(([^)]*)\)/g)) assert.match(m[1], /\S+\s+\S+\s+\S+/, `${f}: skip without a reason`);
    for (const m of text.matchAll(/process\.platform (?:===|!==) '([a-z0-9]+)'/g)) assert.ok(['win32', 'linux', 'darwin'].includes(m[1]), m[1]);
  }
});

test('tests: a time limit in a test widens under coverage through NODE_V8_COVERAGE, never through the flags of the process', async () => {
  const hostile = await read('test/hostile.test.js');
  assert.match(hostile, /const COVERAGE = Boolean\(process\.env\.NODE_V8_COVERAGE\);/);
  assert.match(hostile, /const limit = COVERAGE \? ms \* 4 : ms;/);
  for (const f of (await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.js'))) {
    const text = await read(`test/${f}`);
    assert.doesNotMatch(text, new RegExp(['exec', 'Argv'].join('')), f);
    if (/Date\.now\(\) - start/.test(text)) assert.ok(text.includes('COVERAGE ? ms * 4 : ms'), `${f}: a time check that does not widen under coverage`);
  }
});

test('tests, tools and examples: no number that reads like a year and no date; timestamps are built from day numbers at run time', async () => {
  for (const f of [...(await filesOf('test')), ...(await filesOf('examples')), ...(await filesOf('tools'))]) {
    const text = await read(f);
    assert.doesNotMatch(text, YEAR, f);
    assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}/, f);
  }
  const helpers = await read('test/helpers.js');
  assert.match(helpers, /export const isoDay = \(day\) => dateOfDay\(day\);/);
  assert.match(helpers, /export function changeDay\(zone, start, direction = 1\)/);
});

test('research/sources: the saved pages are plain text files with LF line ends', async () => {
  const files = await readdir(resolve(root, 'research/sources'));
  assert.equal(files.length, 10);
  for (const f of files) {
    const text = await read(`research/sources/${f}`);
    assert.ok(!text.includes('\r'), f);
    assert.ok(text.startsWith('Source: https://'), f);
    assert.ok(text.endsWith('\n'), f);
  }
});

test('the examples are made up: logins only, no address, no token-shaped string, no link, ASCII, LF line ends', async () => {
  const tokenShape = new RegExp(`${['gh', 'p_'].join('')}[A-Za-z0-9]{20}|${['github', '_pat_'].join('')}|${['AK', 'IA'].join('')}[0-9A-Z]{16}`);
  const files = await filesOf('examples');
  for (const f of files) {
    const text = await read(f);
    assert.doesNotMatch(text, tokenShape, f);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), f);
    assert.ok(!text.includes('@'), `${f} holds no email address`);
    if (!f.startsWith('examples/output/')) {
      assert.doesNotMatch(text, /https?:\/\//i, `${f} holds no link`);
      assert.ok(!text.includes('\r'), `${f} keeps LF line ends`);
    }
  }
  assert.deepEqual(files, ['examples/config.json', 'examples/output/report-explain.txt', 'examples/output/report.json', 'examples/output/report.md', 'examples/output/report.txt', 'examples/pulls-plan.json', 'examples/team.json']);
});
