// Command line: review-latency-check --pulls <file> --team <file> --config <file> [options]

import { readFileSync } from 'node:fs';
import { InputError, checkPaths } from './check.js';
import { writeReport } from './files.js';
import { toText, toMarkdown, toJson } from './report.js';
import { METRICS, CHECK } from './rules.js';
import { LABEL_KINDS } from './days.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson };

export const USAGE = `Usage: review-latency-check --pulls <file> --team <file> --config <file> [options]

Measures how long code reviews wait in a team spread over time zones, from pull request data saved from the GitHub
REST API: the wait for the first review, the first approval and the merge, on the clock on the wall and in the
working hours of the person who ended the wait, in their own time zone. It calls no API, needs no token, reads no
clock, opens no network connection and writes nothing to disk but the file --out names. It shows logins only.

Options:
  --pulls <file>            the pull requests, their reviews and their issue events, as the GitHub REST API returns
                            them, in one JSON object (docs/inputs.md); required
  --team <file>             the team file (JSON): each login with its time zone and working hours; required
  --config <file>           the configuration (JSON): the limit of a first review, the percentile, the bots;
                            required, because the tool has no limit of its own
  --as-of <moment>          measure open pull requests with no review until this moment: latest (the last moment in
                            the pull request file) or a timestamp YYYY-MM-DDTHH:MM:SSZ
  --time-labels <kind>      date (Mon 02 Mar 14:05Z, no year), offset (day 3 (Thu) 14:05Z, counted from the day of
                            the first pull request) or iso (a full timestamp) (default: date)
  --format <name>           text, markdown or json (default: text)
  --explain                 show the moments behind each number, and the sentences the measures rest on
  --out <file>              write the report to this file instead of the screen
  --help                    show this text
  --version                 show the version

Waits: ${METRICS.map((m) => m.id).join(', ')}. Check: ${CHECK.id}.

Exit codes: 0 no pull request waited past the limit, 1 some did, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

export function parseArgs(argv) {
  const o = { pulls: null, team: null, config: null, asOf: null, labels: null, format: null, explain: false, out: null, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--explain') o.explain = true;
    else if (a === '--pulls') o.pulls = once(a, o.pulls, next());
    else if (a === '--team') o.team = once(a, o.team, next());
    else if (a === '--config') o.config = once(a, o.config, next());
    else if (a === '--as-of') o.asOf = once(a, o.asOf, next());
    else if (a === '--time-labels') o.labels = once(a, o.labels, next());
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--out') o.out = once(a, o.out, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else throw new Error(`unexpected argument ${a}; give the pull request file with --pulls ${a}`);
  }
  if (!o.help && !o.version) {
    if (!o.pulls) throw new Error('give the pull request file with --pulls <file>');
    if (!o.team) throw new Error('give the team file with --team <file>');
    if (!o.config) throw new Error('give the configuration with --config <file>; the limit of a first review has no default');
    for (const p of [o.pulls, o.team, o.config, o.out].filter(Boolean)) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    o.labels ??= 'date';
    if (!LABEL_KINDS.includes(o.labels)) throw new Error(`unknown time labels ${o.labels} (date, offset or iso)`);
    o.format ??= 'text';
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown or json)`);
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no pull request waited past the limit, 1 some did, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`review-latency-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  let report;
  try {
    report = await checkPaths({ pulls: o.pulls, team: o.team, config: o.config, asOf: o.asOf, labels: o.labels, version: VERSION, explain: o.explain, limits, base });
  } catch (error) {
    if (error instanceof InputError) io.err(`review-latency-check: no verdict, the input has ${error.problems.length === 1 ? 'a problem' : `${error.problems.length} problems`}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`review-latency-check: ${clean(error.message)}\n`);
    return 2;
  }
  const text = FORMATS[o.format](report, { explain: o.explain });
  if (o.out) {
    try {
      const shown = await writeReport(o.out, text, base, [o.pulls, o.team, o.config]);
      io.err(`review-latency-check: the report is in ${clean(shown)}; ${report.verdict.text}\n`);
    } catch (error) {
      io.err(`review-latency-check: ${clean(error.message)}\n`);
      return 2;
    }
  } else io.out(text);
  return report.verdict.pass ? 0 : 1;
}
