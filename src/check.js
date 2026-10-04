// Reads the three files, measures every pull, and builds the report that src/report.js writes as text, Markdown or
// JSON. The report holds labels, not raw moments: with --time-labels date or offset it holds no year, and with offset
// no date at all.

import { readTextFile, FILE_LIMITS } from './files.js';
import { ConfigError } from './strict.js';
import { readPulls } from './github.js';
import { readTeam, hoursText } from './team.js';
import { readConfig } from './config.js';
import { DAY_MS, clockOf, dayLabel, durationText, minutesOfMs, parseTimestamp, timeLabel } from './days.js';
import { makeClock, clockChanges, formatOffset } from './zones.js';
import { teamWorkTimes } from './hours.js';
import { EXCLUDED, SKIPPED_REVIEWS, measurePull } from './metrics.js';
import { summarize } from './stats.js';
import { CHECK, METRICS } from './rules.js';
import { FACTS, factPage } from './data.js';
import { grouped, listText, plural } from './size.js';
import { safeText } from './text.js';
import { clockText } from './team.js';

export const LIMITS = { ...FILE_LIMITS };

// The most problems an error lists; the rest are counted.
export const MAX_PROBLEMS = 20;

// The first problems of a list, and a count of the rest.
export const capProblems = (problems) => (problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), `and ${(problems.length - MAX_PROBLEMS).toLocaleString('en-US')} more`] : problems);

export class InputError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.problems = problems;
  }
}

// The limit as one sentence of the report.
export function limitText(limit) {
  return limit.measure === 'working'
    ? `a first review within ${durationText(limit.minutes * 60000)} (${plural(limit.minutes, 'minute')}) of the working hours of the reviewer`
    : `a first review within ${durationText(limit.minutes * 60000)} (${plural(limit.minutes, 'minute')}) on the clock on the wall`;
}

// The value of --as-of: "latest" (the last moment in the pull request file) or a timestamp. Returns milliseconds, null
// when --as-of was not given, or throws InputError.
export function readAsOf(text, latest) {
  if (text === null || text === undefined) return null;
  if (text === 'latest') return latest;
  const t = parseTimestamp(text);
  if (t === null) throw new InputError([`--as-of ${safeText(text, 60)} is not latest or a timestamp written YYYY-MM-DDTHH:MM:SSZ`]);
  if (latest !== null && t < latest) throw new InputError([`--as-of ${safeText(text, 60)} comes before the last moment in the pull request file; give a later moment, or latest`]);
  return t;
}

// A span of moments as the reports write it: the end without its day when it is on the same UTC day as the start.
export function spanText(a, b, labels, origin) {
  if (b === Infinity) return `from ${timeLabel(a, labels, origin)}, still open`;
  const end = Math.floor(a / DAY_MS) === Math.floor(b / DAY_MS) && labels !== 'iso' ? `${clockOf(b)}Z` : timeLabel(b, labels, origin);
  return `${timeLabel(a, labels, origin)}-${end}`;
}

const spansText = (list, labels, origin) => (list.length ? list.map(([a, b]) => spanText(a, b, labels, origin)).join(', ') : 'none');

// The lines of --explain for one measured pull.
function explainOf(r, labels, origin, offsetAt) {
  const L = (ms) => timeLabel(ms, labels, origin);
  const lines = [`ready for review and open: ${spansText(r.spans, labels, origin)}${r.eventsGiven ? '' : ' (no issue events given)'}`];
  const wait = (title, w, whose, zone) => {
    lines.push(title);
    lines.push(`  on the wall: ${spansText(w.window, labels, origin)} = ${durationText(w.wallMs)}`);
    lines.push(`  ${whose}${zone ? ` (${zone}, ${formatOffset(offsetAt(zone, w.start))} at the start)` : ''}: ${spansText(w.working, labels, origin)} = ${durationText(w.workMs)}`);
  };
  if (r.firstReview) wait(`first review: ${r.firstReview.by} (${r.firstReview.zone}), ${r.firstReview.state}, at ${L(r.firstReview.at)}`, r.firstReview, `working hours of ${r.firstReview.by}`, r.firstReview.zone);
  else if (r.unreviewed.end === null) lines.push('first review: none, and the pull request is still open; give --as-of to measure the wait');
  else wait(`first review: none; waited until ${r.unreviewed.kind === 'closed' ? 'it was closed' : '--as-of'} at ${L(r.unreviewed.end)}`, r.unreviewed, 'working hours of at least one other person of the team', null);
  if (r.firstApproval) wait(`first approval: ${r.firstApproval.by} (${r.firstApproval.zone}) at ${L(r.firstApproval.at)}`, r.firstApproval, `working hours of ${r.firstApproval.by}`, r.firstApproval.zone);
  if (r.merge) wait(`merge: at ${L(r.merge.at)}`, r.merge, `working hours of the author ${r.merge.by}`, r.merge.zone);
  return lines.map((l) => safeText(l, 4000));
}

const waitRow = (w) => (w ? { by: w.by, zone: w.zone, ...(w.state ? { state: w.state } : {}), wallMinutes: minutesOfMs(w.wallMs), workingMinutes: minutesOfMs(w.workMs) } : null);

// Builds the report of the three file texts. files = { pulls, team, config } holds the paths shown.
export function buildReport({ pullsText, teamText, configText, files = { pulls: 'pulls', team: 'team', config: 'config' }, asOf: asOfText = null, labels = 'date', version = '', explain = true }) {
  const problems = [];
  const read = (fn, text, file) => {
    try {
      return fn(text, file);
    } catch (error) {
      if (error instanceof ConfigError) problems.push(...error.problems.map((p) => p.text));
      else throw error;
      return null;
    }
  };
  const config = read(readConfig, configText, files.config);
  const team = read(readTeam, teamText, files.team);
  const data = read(readPulls, pullsText, files.pulls);
  if (problems.length) throw new InputError(capProblems(problems));
  if (!data.pulls.length) throw new InputError([`${files.pulls}: pulls is an empty list; there is nothing to measure`]);
  const asOf = readAsOf(asOfText, data.latest);

  const firstMs = Math.min(...data.pulls.map((p) => p.created));
  const lastMs = Math.max(data.latest, asOf ?? data.latest);
  const origin = Math.floor(firstMs / DAY_MS);
  const lastDay = Math.floor(lastMs / DAY_MS);
  const L = (ms) => timeLabel(ms, labels, origin);
  const zones = [...new Set(team.people.map((p) => p.zone))];
  const clock = makeClock(zones, origin - 2, lastDay + 2);
  const work = teamWorkTimes(team.people, clock, firstMs, lastMs);
  const ctx = { team: new Map(team.people.map((p) => [p.key, p])), bots: config.bots, unknownLogins: config.unknownLogins, work, asOf, limit: config.limit, problems: [] };
  const records = data.pulls.map((p) => measurePull(p, ctx));
  if (ctx.problems.length) throw new InputError(capProblems(ctx.problems.map((t) => `${files.pulls}: ${safeText(t, 600)}`)));
  const measured = records.filter((r) => !r.excluded);
  if (!measured.length) throw new InputError([`no pull request to measure: all ${plural(records.length, 'pull request')} ${records.length === 1 ? 'is' : 'are'} left out (${listText(EXCLUDED.filter((e) => records.some((r) => r.excluded === e.kind)).map((e) => e.text), 4)}); a run with nothing measured gives no verdict`]);

  const p = config.percentile;
  const minutes = (list, key) => list.map((w) => minutesOfMs(w[key]));
  const stat = (list) => ({ count: list.length, wall: summarize(minutes(list, 'wallMs'), p), working: summarize(minutes(list, 'workMs'), p) });
  const reviewed = measured.filter((r) => r.firstReview);
  const overall = [
    { metric: 'first-review', hoursOf: METRICS[0].hoursOf, ...stat(reviewed.map((r) => r.firstReview)) },
    { metric: 'first-approval', hoursOf: METRICS[1].hoursOf, ...stat(measured.filter((r) => r.firstApproval).map((r) => r.firstApproval)) },
    { metric: 'merge', hoursOf: METRICS[2].hoursOf, ...stat(measured.filter((r) => r.merge).map((r) => r.merge)) }
  ];
  const pairMap = new Map();
  for (const r of reviewed) {
    const k = `${r.authorZone}\n${r.firstReview.zone}`;
    if (!pairMap.has(k)) pairMap.set(k, { authorZone: r.authorZone, reviewerZone: r.firstReview.zone, list: [] });
    pairMap.get(k).list.push(r.firstReview);
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const pairs = [...pairMap.values()].sort((a, b) => cmp(a.authorZone, b.authorZone) || cmp(a.reviewerZone, b.reviewerZone)).map(({ list, ...k }) => ({ ...k, ...stat(list) }));

  const late = measured.filter((r) => r.late).map((r) => {
    const w = r.firstReview ?? r.unreviewed;
    return {
      number: r.number,
      author: r.author,
      authorZone: r.authorZone,
      kind: r.firstReview ? 'review' : r.unreviewed.kind === 'closed' ? 'closed-unreviewed' : 'open-unreviewed',
      by: r.firstReview ? r.firstReview.by : null,
      reviewerZone: r.firstReview ? r.firstReview.zone : null,
      ready: L(r.start),
      end: L(w.end),
      wallMinutes: minutesOfMs(w.wallMs),
      workingMinutes: minutesOfMs(w.workMs)
    };
  });

  const pulls = measured.map((r) => ({
    number: r.number,
    author: r.author,
    authorZone: r.authorZone,
    state: r.state,
    ready: L(r.start),
    startedAsDraft: r.startedAsDraft,
    firstReview: r.firstReview ? { ...waitRow(r.firstReview), at: L(r.firstReview.at) } : null,
    unreviewed: r.unreviewed ? (r.unreviewed.end === null ? { kind: 'open', end: null } : { kind: r.unreviewed.kind, end: L(r.unreviewed.end), wallMinutes: minutesOfMs(r.unreviewed.wallMs), workingMinutes: minutesOfMs(r.unreviewed.workMs) }) : null,
    firstApproval: r.firstApproval ? { ...waitRow(r.firstApproval), at: L(r.firstApproval.at) } : null,
    merge: r.merge ? { wallMinutes: minutesOfMs(r.merge.wallMs), workingMinutes: minutesOfMs(r.merge.workMs), at: L(r.merge.at) } : null,
    skippedReviews: r.skipped,
    late: r.late,
    ...(explain ? { explain: explainOf(r, labels, origin, clock.offsetAt) } : {})
  }));

  const excludedCounts = Object.fromEntries(EXCLUDED.map((e) => [e.kind, records.filter((r) => r.excluded === e.kind).map((r) => r.number)]));
  const skippedCounts = Object.fromEntries(SKIPPED_REVIEWS.map((s) => [s.kind, measured.reduce((n, r) => n + (r.skipped[s.kind] ?? 0), 0)]));
  const notes = [];
  for (const e of EXCLUDED) {
    const list = excludedCounts[e.kind];
    if (list.length) notes.push(`left out: ${plural(list.length, 'pull request')} ${e.text}: ${listText(list.map((n) => `#${n}`), 12)}`);
  }
  for (const s of SKIPPED_REVIEWS) if (skippedCounts[s.kind]) notes.push(`not a first review: ${plural(skippedCounts[s.kind], 'review')} ${s.text}`);
  const noEvents = measured.filter((r) => !r.eventsGiven);
  if (noEvents.length) notes.push(`${plural(noEvents.length, 'pull request')} ${noEvents.length === 1 ? 'has' : 'have'} no list of issue events (${listText(noEvents.map((r) => `#${r.number}`), 12)}): each is taken as ready from created_at, so one that began as a draft is counted from the moment it was opened`);
  const openNoReview = measured.filter((r) => r.unreviewed && r.unreviewed.end === null);
  if (openNoReview.length) notes.push(`${plural(openNoReview.length, 'open pull request')} ${openNoReview.length === 1 ? 'has' : 'have'} no review yet (${listText(openNoReview.map((r) => `#${r.number}`), 12)}); give --as-of to measure ${openNoReview.length === 1 ? 'its wait' : 'their wait'}`);
  for (const o of work.odd) {
    if (o.day < origin || o.day > lastDay) continue;
    notes.push(o.kind === 'gap'
      ? `${o.zone}: ${clockText(o.minute)} on ${dayLabel(o.day, labels, origin)} does not exist, the clocks skip it; the shift of ${o.login} is read at ${clockText(o.minute)} on the clock before the change`
      : `${o.zone}: ${clockText(o.minute)} on ${dayLabel(o.day, labels, origin)} happens twice, the clocks pass it again; the shift of ${o.login} is read at the first of the two`);
  }

  const clockChangeList = [];
  for (const z of zones) for (const c of clockChanges(clock, z, origin, lastDay)) clockChangeList.push({ zone: z, day: c.day, label: dayLabel(c.day, labels, origin), before: formatOffset(c.before), after: formatOffset(c.after) });
  clockChangeList.sort((a, b) => a.day - b.day || cmp(a.zone, b.zone));

  const pass = late.length === 0;
  const lim = config.limit;
  const limitShort = `${durationText(lim.minutes * 60000)} ${lim.measure === 'working' ? 'of working hours' : 'on the wall'}`;
  const verdictText = pass
    ? `PASS - none of ${plural(measured.length, 'pull request')} waited longer than ${limitShort} for a first review`
    : `FAIL - ${grouped(late.length)} of ${plural(measured.length, 'pull request')} waited longer than ${limitShort} for a first review`;
  const basis = [...new Set([...METRICS.flatMap((m) => m.facts), ...CHECK.facts])].map((k) => ({ key: k, text: FACTS[k].text, section: FACTS[k].section, page: factPage(k) }));

  return {
    tool: 'review-latency-check',
    version,
    files,
    labels,
    team: { name: team.name, people: team.people.map((x) => ({ login: x.login, zone: x.zone, hours: hoursText(x.week) })) },
    limit: { measure: lim.measure, minutes: lim.minutes, text: limitText(lim) },
    percentile: p,
    bots: config.bots,
    unknownLogins: config.unknownLogins,
    asOf: asOf === null ? null : L(asOf),
    span: { first: L(firstMs), last: L(data.latest) },
    clockChanges: clockChangeList.map(({ day, ...c }) => c),
    counts: {
      read: records.length,
      measured: measured.length,
      reviewed: reviewed.length,
      approved: overall[1].count,
      merged: overall[2].count,
      closedUnreviewed: measured.filter((r) => r.unreviewed?.kind === 'closed').length,
      openUnreviewed: measured.filter((r) => r.unreviewed && r.unreviewed.kind !== 'closed').length,
      late: late.length,
      excluded: Object.fromEntries(Object.entries(excludedCounts).map(([k, v]) => [k, v.length])),
      skippedReviews: skippedCounts
    },
    overall,
    pairs,
    late,
    pulls,
    basis,
    notes: notes.map((n) => safeText(n, 1500)),
    verdict: { pass, text: verdictText }
  };
}

// Reads the files named on the command line and builds the report. Paths are relative to base.
export async function checkPaths({ pulls, team, config, asOf, labels, version, explain = true, limits = {}, base = process.cwd() }) {
  const lim = { ...LIMITS, ...limits };
  const problems = [];
  const load = async (path, max) => {
    try {
      return await readTextFile(path, base, max);
    } catch (error) {
      problems.push(error.message);
      return null;
    }
  };
  const p = await load(pulls, lim.maxPullsBytes);
  const t = await load(team, lim.maxTeamBytes);
  const c = await load(config, lim.maxConfigBytes);
  if (problems.length) throw new InputError(problems);
  return buildReport({ pullsText: p.text, teamText: t.text, configText: c.text, files: { pulls: p.file, team: t.file, config: c.file }, asOf, labels, version, explain });
}
