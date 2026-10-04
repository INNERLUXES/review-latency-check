// The three waits of a pull request, each on the clock on the wall and in working hours:
//
//   first review    from the moment the pull was first ready for review to the first review submitted by someone who is
//                   not the author and not a bot; working hours of that reviewer, in their zone
//   first approval  the same, to the first review in the state APPROVED; working hours of the approver
//   merge           the same, to merged_at; working hours of the author, who is the one waiting
//
// Only time in which the pull was open and ready counts (src/timeline.js). A pull that got no review waited until it
// was closed, or until --as-of for a pull that is still open; its working wait counts the time in which at least one
// other person of the team was at work, because any of them could have reviewed it. Reviews by the author, by bots,
// reviews that were never submitted (PENDING) and reviews submitted before the pull was first ready are not a first
// review. docs/method.md gives every case.

import { clip, intersect, total } from './intervals.js';
import { isBot, loginKey } from './logins.js';
import { readySpans, TimelineError } from './timeline.js';

// The kinds of pull that are left out of every number, in the order the reports count them.
export const EXCLUDED = [
  { kind: 'bot', text: 'opened by a bot' },
  { kind: 'no-author', text: 'with no author (user is null)' },
  { kind: 'outside-team', text: 'opened by a login that is not in the team file' },
  { kind: 'never-ready', text: 'never ready for review (still a draft)' }
];

// The kinds of review that are not a first review, in the order the reports count them.
export const SKIPPED_REVIEWS = [
  { kind: 'author', text: 'by the author of the pull request' },
  { kind: 'bot', text: 'by a bot' },
  { kind: 'pending', text: 'never submitted (PENDING)' },
  { kind: 'no-user', text: 'with no reviewer (user is null)' },
  { kind: 'before-ready', text: 'submitted before the pull request was first ready for review' },
  { kind: 'outside-team', text: 'by a login that is not in the team file' }
];

// The wait from start to end: the time inside the ready spans, and the part of it inside the working time given.
export function waitOf(spans, start, end, work) {
  const window = clip(spans, start, end);
  const working = intersect(window, clip(work, start, end));
  return { start, end, window, working, wallMs: total(window), workMs: total(working) };
}

// Measures one pull. ctx = { team: Map(login key -> person), bots, unknownLogins, work, asOf, limit }.
// Returns { pull, excluded } for a pull that is left out, or the measured record. Problems that stop the run (a login
// outside the team with unknownLogins "fail", events that contradict the pull) are pushed to ctx.problems.
export function measurePull(pull, ctx) {
  const base = { number: pull.number, author: pull.author };
  if (pull.author === null) return { ...base, excluded: 'no-author' };
  if (isBot(pull.author, pull.authorType, ctx.bots)) return { ...base, excluded: 'bot' };
  const authorKey = loginKey(pull.author);
  const author = ctx.team.get(authorKey);
  if (!author) {
    if (ctx.unknownLogins === 'fail') ctx.problems.push(`${pull.path}.user.login: ${pull.author}, the author of #${pull.number}, is not in the team file; add the login, list it under bots, or set "unknownLogins": "exclude"`);
    return { ...base, excluded: 'outside-team' };
  }
  let ready;
  try {
    ready = readySpans(pull);
  } catch (error) {
    if (error instanceof TimelineError) {
      ctx.problems.push(error.message);
      return { ...base, excluded: 'never-ready' };
    }
    throw error;
  }
  if (!ready.spans.length) return { ...base, author: author.login, excluded: 'never-ready' };
  const start = ready.spans[0][0];
  const skipped = {};
  const reviews = [];
  for (const r of pull.reviews) {
    let kind = null;
    if (r.submitted === null) kind = 'pending';
    else if (r.login === null) kind = 'no-user';
    else if (isBot(r.login, r.type, ctx.bots)) kind = 'bot';
    else if (loginKey(r.login) === authorKey) kind = 'author';
    else if (r.submitted < start) kind = 'before-ready';
    else if (!ctx.team.has(loginKey(r.login))) {
      if (ctx.unknownLogins === 'fail') ctx.problems.push(`${r.path}.user.login: ${r.login}, a reviewer of #${pull.number}, is not in the team file; add the login, list it under bots, or set "unknownLogins": "exclude"`);
      kind = 'outside-team';
    }
    if (kind) skipped[kind] = (skipped[kind] ?? 0) + 1;
    else reviews.push({ ...r, person: ctx.team.get(loginKey(r.login)) });
  }
  const measureTo = (r) => ({ by: r.person.login, zone: r.person.zone, state: r.state, at: r.submitted, ...waitOf(ready.spans, start, r.submitted, ctx.work.of(r.person.key)) });
  const first = reviews[0];
  const approval = reviews.find((r) => r.state === 'APPROVED');
  const record = {
    ...base,
    author: author.login,
    authorZone: author.zone,
    excluded: null,
    startedAsDraft: ready.startedAsDraft,
    eventsGiven: pull.events !== null,
    spans: ready.spans,
    start,
    state: pull.merged !== null ? 'merged' : pull.state === 'closed' ? 'closed' : 'open',
    firstReview: first ? measureTo(first) : null,
    firstApproval: approval ? measureTo(approval) : null,
    merge: pull.merged !== null ? { by: author.login, zone: author.zone, at: pull.merged, ...waitOf(ready.spans, start, pull.merged, ctx.work.of(authorKey)) } : null,
    unreviewed: null,
    skipped,
    late: false
  };
  if (!first) {
    const end = pull.closed ?? ctx.asOf;
    record.unreviewed = end === null ? { kind: 'open', end: null } : { kind: pull.closed !== null ? 'closed' : 'as-of', ...waitOf(ready.spans, start, end, ctx.work.othersOf(authorKey)) };
  }
  const wait = record.firstReview ?? (record.unreviewed.end === null ? null : record.unreviewed);
  if (wait) record.late = (ctx.limit.measure === 'working' ? wait.workMs : wait.wallMs) > ctx.limit.minutes * 60000;
  return record;
}
