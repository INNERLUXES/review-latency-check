# Method

This page says how each number of the report is found: where a wait starts and ends, whose working hours count, which reviews count, how the time zone math is done, and how the median and the percentile are picked. Where a choice is the tool's own and no page makes it, the text says so.

## The input, in short

The tool reads three files (docs/inputs.md has every field and key):

- the pull request file: the list of pull requests, the reviews of each, and, when given, the issue events of each, as the GitHub REST API returns them;
- the team file: each login with an IANA time zone and working hours by day of the week in local time;
- the configuration: the limit of a first review, the percentile, the bots, and what to do with a login that is not in the team file.

GitHub writes every time in UTC; its documentation says: "Timestamps returned by the API are in UTC time, ISO 8601 format." The tool reads each timestamp with one strict pattern of RFC 3339 (`YYYY-MM-DDTHH:MM:SSZ`, with an optional fraction and an optional numeric offset) and works in milliseconds of UTC from there on.

## When a pull request is waiting

A pull request waits for review while it is open and not a draft. The tool builds these spans for each pull request:

1. Without issue events, the pull request is ready from `created_at`, unless it is a draft now: then it was never ready. It is open until `closed_at`, or still open.
2. With its issue events, the spans follow the events `ready_for_review`, `convert_to_draft`, `closed`, `reopened` and `merged`, in the order of their `created_at`. GitHub describes the first as "A draft pull request was marked as ready for review." and the second as "The pull request was converted to draft mode." Other events are skipped.
3. Whether the pull request was opened as a draft is read from the first of `ready_for_review` and `convert_to_draft`: when the first is `ready_for_review`, it was opened as a draft. With neither event, it keeps the draft flag it has now.
4. The spans end at `closed_at` at the latest.

The events must agree with the pull request. When they leave it a draft while its `draft` flag is false (or the other way round), or leave it closed while its state is open, the list of events is not complete, and the run stops with exit code `2` rather than guess. This is the tool's own choice: a missing event would move every number of that pull request without a sign.

The wait of a pull request starts at the start of its first span. Only time inside the spans counts: the hours a pull request spent as a draft again, or closed before it was reopened, are not waiting. A pull request that was never ready is left out, with a note.

## Which reviews count

GitHub lists the reviews of a pull request with their state and `submitted_at`: "Lists all reviews for a specified pull request. The list of reviews returns in chronological order." The tool sorts them by `submitted_at` all the same. A review is not a first review when it is:

| Kind | Why |
| --- | --- |
| by the author | a self-review ends no wait; logins are compared without case |
| by a bot | `user.type` is `Bot`, or a pattern of `bots` in the configuration matches the login |
| never submitted | its state is `PENDING`; GitHub says such reviews "are not submitted and therefore do not include the submitted_at property in the response" |
| with no reviewer | `user` is null (a deleted account) |
| submitted before the pull request was first ready | feedback on a draft ends no wait for review |
| by a login outside the team | only with `"unknownLogins": "exclude"`; by default the run stops |

The report counts each kind in a note. Every review state counts as a review: `COMMENTED`, `CHANGES_REQUESTED`, `APPROVED` and `DISMISSED`. A dismissed review was submitted, so it ended the wait for a first review; it is not an approval.

## The waits

Each wait is counted twice: on the clock on the wall, and in working hours. On the wall, it is the length of the spans between the start and the end. In working hours, it is the part of those spans in which one person was at work, in their own time zone.

### `first-review`

From the start to the first review that counts (see above). Working hours: those of the reviewer. A pull request with no such review waited until it was closed, or until `--as-of` when it is still open; its working wait counts the time in which at least one other person of the team was at work, because any of them could have reviewed it. Without `--as-of`, an open pull request with no review has no end, and the report says so in a note.

### `first-approval`

From the start to the first review that counts and has the state `APPROVED`. An approval that was dismissed later has the state `DISMISSED` in the list of reviews (GitHub: "Dismisses a specified review on a pull request."), so it is not an approval. Working hours: those of the approver.

### `merge`

From the start to `merged_at`. Working hours: those of the author, who is the one waiting for the merge. A pull request that was not merged has no merge wait.

### `first-review-limit`

The check that decides the exit code. A pull request is past the limit when its first review came later than `firstReviewLimit.minutes` after its start, counted in working minutes of the reviewer (`"measure": "working"`) or on the wall (`"measure": "wall"`). Later means strictly more: a wait of exactly the limit is not past it. A pull request with no review is past the limit when it waited longer than the limit before it was closed, or before `--as-of`. The limit has no default: a configuration without it is refused.

## Working hours

Each shift of the team file is written in local time. For every local day of the data it is turned into a moment of UTC with the offset that the zone has at that moment, read from `Intl.DateTimeFormat(...).formatToParts` and nothing else; the tool carries no copy of the time zone database. A shift on the day the clocks move is an hour shorter or longer than its clock times say. A day off takes out the shifts of that local day. A weekend is a day with no shift.

Two local times need a rule of their own, and the rule is the tool's own choice:

| Local time | Read as |
| --- | --- |
| skipped when the clocks move forward | the same time on the clock before the change, which lands that far after the gap |
| repeated when the clocks move back | the first of the two |

A shift with such a time gets a note in the report.

Time zone names fail closed. A name is checked in three steps and refused at the first that fails: it is written as a name (a UTC offset such as `+01:00` is refused, because an offset never changes with the clocks); `Intl.DateTimeFormat` accepts it (ECMA-402: "If timeZoneIdentifierRecord is empty, throw a RangeError exception."); and the primary name it resolves to is listed by `Intl.supportedValuesOf('timeZone')`, or is UTC. There is no fallback to UTC or to the zone of the machine.

## The median and the percentile

The report gives, for every pair of author zone and reviewer zone and for all pull requests together, the count, the median, an upper percentile and the longest wait, on the wall and in working hours. There is no average: one pull request that waited a week would move an average for everyone and hide where the time went.

Percentiles use the nearest-rank method. The p-th percentile of n waits sorted from short to long is the wait at rank ceil(p x n / 100), counted from 1, and the first wait when that rank is 0. Every number of the report is therefore one of the waits that happened, never a value between two of them. The median is the 50th percentile by the same rule, which for an even count is the lower of the two middle waits. Examples:

| Waits (minutes) | Median | 90th percentile |
| --- | --- | --- |
| 10, 20, 30, 40 | 20 (rank 2) | 40 (rank 4) |
| 10 to 100 in steps of 10 | 50 (rank 5) | 90 (rank 9) |
| the same and one of 1000 | 60 (rank 6) | 100 (rank 10) |

The percentile is 90 unless the configuration sets `percentile`, a whole number from 50 to 100. The pair of a pull request is the zone of its author and the zone of its first reviewer; pull requests with no review are in no pair.

## Logins

Logins are compared without case, on ASCII letters, as GitHub compares them. A login of the pull request file that is not in the team file, not a bot and not the author's own, stops the run by default (`"unknownLogins": "fail"`), because the tool cannot know its working hours. With `"exclude"` a pull request by such a login is left out, and a review by such a login is not a first review; both are counted in a note.

## Failing closed

Input that cannot be read stops the run with exit code `2` and no verdict, so a number is never built on a guess: a missing or broken timestamp, a submitted review without `submitted_at`, a pull request whose list of reviews was not given (an empty list says "no review"; a missing one could be a missing export), a review state the tool does not know, a pull request closed before it was opened or merged after it was closed, a review or an event before the pull request was opened, events that contradict the pull request, an unknown key in the team file or the configuration, a key named twice in any object, and a run in which nothing is left to measure.
