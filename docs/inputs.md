# Inputs

The tool reads three JSON files, named on the command line: the pull request file (`--pulls`), the team file (`--team`) and the configuration (`--config`). All three are read with a strict JSON reader that refuses comments, trailing commas and an object that names a key twice. RFC 8259 says of such an object: "When the names within an object are not unique, the behavior of software that receives such an object is unpredictable." A number must never depend on which of two values a library keeps, so the file is refused.

## The pull request file

One JSON object with three keys. Another key at the top is an error.

```json
{
  "pulls": [ ...the items of GET /repos/{owner}/{repo}/pulls?state=all... ],
  "reviews": { "101": [ ...the items of GET /repos/{owner}/{repo}/pulls/101/reviews... ] },
  "events": { "101": [ ...the items of GET /repos/{owner}/{repo}/issues/101/events... ] }
}
```

| Key | Needed | What |
| --- | --- | --- |
| `pulls` | yes | the pull requests, as the list of pull requests returns them; ask for `state=all` so closed and merged ones are there, and follow every page (`per_page` is at most 100) |
| `reviews` | yes | an object from each pull number to its list of reviews; every pull needs an entry, `[]` for a pull with no review, so a missing export is never read as no review |
| `events` | no | an object from pull numbers to their issue events; a pull with no entry is taken as ready from `created_at` (docs/method.md), with a note |

GitHub objects carry dozens of fields. The tool reads the fields below and skips the rest unread; inside a GitHub object another field is allowed, but a field named twice is still refused. A title, a body, `user.name`, `user.email` and every address are never read and never shown.

### Fields of a pull request

From the page List pull requests (research/sources/github-rest-pulls-list.txt): "Lists pull requests in a specified repository."

| Field | Schema on the page | How it is read |
| --- | --- | --- |
| `number` | required, integer | a whole number from 1, once in the list; needed |
| `state` | required, string | `open` or `closed`; anything else stops the run |
| `draft` | boolean | `true` or `false`; a pull without the field is not a draft |
| `user.login` | `user` is required, null or a Simple User with a required `login` | the author; a null user is left out with a note, a user without a login stops the run |
| `user.type` | required, string | `Bot` marks a bot; may be left out |
| `created_at` | required, string, date-time | needed; missing or not a timestamp stops the run |
| `closed_at` | required, string or null, date-time | null for an open pull, the moment it was closed for a closed one; must not be before `created_at` |
| `merged_at` | required, string or null, date-time | null when not merged; must lie between `created_at` and `closed_at` |

### Fields of a review

From the page List reviews for a pull request (research/sources/github-rest-pull-reviews.txt). The examples on that page write the states in upper case, such as `APPROVED`, `CHANGES_REQUESTED` and `DISMISSED`; the timeline writes them in lower case: "The state of the submitted review. Can be one of: commented, changes_requested, approved or dismissed." The tool reads both.

| Field | Schema on the page | How it is read |
| --- | --- | --- |
| review `user.login` | `user` is required, null or a Simple User | the reviewer; a null user is no first review |
| review `user.type` | required, string | `Bot` marks a bot |
| review `state` | required, string | `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED` or `PENDING`, in either case; anything else stops the run |
| review `submitted_at` | string, date-time | needed for every review but a `PENDING` one; must not be before `created_at` of the pull |

### Fields of an issue event

From the pages List issue events (research/sources/github-rest-issue-events.txt: "Lists all events for an issue.") and Issue event types (research/sources/github-issue-event-types.txt).

| Field | How it is read |
| --- | --- |
| `event` | needed, a string; only `ready_for_review`, `convert_to_draft`, `closed`, `reopened` and `merged` are read, every other event is skipped |
| `created_at` | for the five events read: needed, a timestamp, not before `created_at` of the pull; the page says "The timestamp indicating when the event occurred." |

### Timestamps

A timestamp is the date-time of RFC 3339 section 5.6 with an upper-case `T` and `Z`: `YYYY-MM-DDTHH:MM:SSZ`, with an optional fraction of a second of 1 to 9 digits and an optional offset `+HH:MM` or `-HH:MM` in place of `Z` (the grammar of the RFC: `time-offset = "Z" / time-numoffset`). A date that is not in the calendar, a leap second, a space in place of `T` and a missing offset are refused. GitHub writes UTC with `Z`.

### Exporting the data

The tool calls no API. One way to save the data with the GitHub CLI, run by you with your own login:

```
gh api --paginate "repos/OWNER/REPO/pulls?state=all&per_page=100" > pulls-list.json
gh api --paginate "repos/OWNER/REPO/pulls/101/reviews?per_page=100" > reviews-101.json
gh api --paginate "repos/OWNER/REPO/issues/101/events?per_page=100" > events-101.json
```

Put the lists together into the one object above with the tool you like; `--paginate` can write one array per page, which must be joined into one list.

## The team file

| Key | Needed | What |
| --- | --- | --- |
| `name` | no | a name for the team, shown in the reports |
| `people` | yes | the people of the team, at least one |

Each person:

| Key | Needed | What |
| --- | --- | --- |
| `people[].login` | yes | the GitHub login: letters, digits and single hyphens, at most 39 characters; compared without case, each once; a login with an `@` is refused |
| `people[].zone` | yes | an IANA time zone name such as `Europe/Berlin`; an unknown name or a UTC offset stops the run |
| `people[].hours` | yes | working hours by day of the week in local time: a key `mon` to `sun` or a range such as `mon-fri`, to a list of shifts `HH:MM-HH:MM`; two shifts on a day are a split shift; a shift ends after it starts and at `24:00` at the latest, and a shift across midnight is written as two shifts |
| `people[].daysOff` | no | dates `YYYY-MM-DD` on which the person does not work; the shifts of that local day are taken out |

The example of the repository has no days off, because no file of the repository holds a date.

## The configuration

| Key | Needed | Default | What |
| --- | --- | --- | --- |
| `firstReviewLimit` | yes | none | the limit of the check |
| `firstReviewLimit.measure` | yes | none | `working` (the working hours of the reviewer) or `wall` (the clock on the wall) |
| `firstReviewLimit.minutes` | yes | none | a whole number of minutes from 1 to 100,000; a first review later than this is past the limit |
| `percentile` | no | 90 | the upper percentile the report shows next to the median, a whole number from 50 to 100 |
| `bots` | no | none | logins or patterns of bots, where `*` stands for any run of characters, such as `*[bot]`; compared without case; a pattern that matches every login is refused; accounts with `user.type` `Bot` are bots in any case |
| `unknownLogins` | no | `fail` | what to do with a login that is not in the team file and not a bot: `fail` stops the run, `exclude` leaves the pull request or the review out, with a note |

None of the defaults is a limit. A key the tool does not know stops the run, with its line and a suggestion.

## The command line

| Option | What |
| --- | --- |
| `--pulls <file>` | the pull request file; needed |
| `--team <file>` | the team file; needed |
| `--config <file>` | the configuration; needed |
| `--as-of <moment>` | `latest` (the last moment anywhere in the pull request file) or a timestamp no earlier than that: open pull requests with no review are measured until then |
| `--time-labels <kind>` | `date` (default, no year), `offset` (day 0 is the UTC day of the first pull request) or `iso` |
| `--format <name>` | `text` (default), `markdown` or `json` |
| `--explain` | the spans behind each number, and the sentences the measures rest on |
| `--out <file>` | write the report to this file; an input is refused as its path |
