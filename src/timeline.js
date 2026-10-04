// When a pull request was waiting for review: the spans in which it was open and not a draft. Every number of the report
// counts time inside these spans only, so the hours a pull spent as a draft, or closed before it was reopened, are never
// counted as waiting.
//
// Without events the pull is taken as ready from created_at, unless it is a draft now, in which case it was never
// ready; it is open until closed_at. With the issue events of the pull, the spans follow the events ready_for_review,
// convert_to_draft, closed, reopened and merged in the order of their created_at. Whether the pull started as a draft is
// read from the first of ready_for_review and convert_to_draft: a pull whose first such event is ready_for_review was
// opened as a draft. A pull with neither event keeps the draft flag it has now.
//
// The events must agree with the pull: when they leave the pull a draft and the pull says it is not one (or the other
// way round), or leave it closed while the pull is open, the list of events is not complete, and the run stops rather
// than guess (docs/method.md).

import { normalize } from './intervals.js';

export class TimelineError extends Error {}

// The spans in which a pull was open and ready for review: { spans: [[from, to]], startedAsDraft }, with to = Infinity
// for a pull that is still open. Throws TimelineError when the events contradict the pull.
export function readySpans(pull) {
  const events = pull.events ?? [];
  const firstDraftEvent = events.find((e) => e.event === 'ready_for_review' || e.event === 'convert_to_draft');
  const startedAsDraft = pull.events === null || !firstDraftEvent ? pull.draft : firstDraftEvent.event === 'ready_for_review';
  let open = true;
  let draft = startedAsDraft;
  let since = pull.created;
  const spans = [];
  const ready = () => open && !draft;
  for (const e of events) {
    const wasReady = ready();
    if (e.event === 'closed' || e.event === 'merged') open = false;
    else if (e.event === 'reopened') open = true;
    else if (e.event === 'ready_for_review') draft = false;
    else if (e.event === 'convert_to_draft') draft = true;
    const isReady = ready();
    if (wasReady && !isReady) spans.push([since, e.at]);
    if (!wasReady && isReady) since = e.at;
  }
  if (pull.events !== null && draft !== pull.draft) throw new TimelineError(`#${pull.number}: the events leave the pull request ${draft ? 'a draft' : 'ready for review'}, but its draft flag is ${pull.draft}; give the whole list of its issue events`);
  if (pull.events !== null && !open && pull.state === 'open') throw new TimelineError(`#${pull.number}: the events leave the pull request closed, but its state is open; give the whole list of its issue events`);
  const end = pull.closed ?? Infinity;
  if (ready()) spans.push([since, end]);
  const cut = spans.map(([a, b]) => [a, Math.min(b, end)]);
  return { spans: normalize(cut), startedAsDraft };
}
