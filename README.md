# review-latency-check

Measures how long code reviews wait in a team spread over time zones, from pull request data you saved from the GitHub REST API. For every pull request it finds the wait for the first review, the first approval and the merge, on the clock on the wall and in working hours: only the hours in which the person who ended the wait was at work, in their own time zone, with the clock changes of each zone. It groups the first reviews by the zone of the author and the zone of the reviewer, gives the median and an upper percentile of each group, and lists every pull request whose first review waited past the limit you set.

A review that comes the next morning can be one working hour or nine, depending on who reviewed it and where. A wait over a weekend is three days on the wall and twenty minutes of work. The two numbers side by side show whether reviews are slow, or whether they only cross a night.

- **It calls no API and needs no token.** It reads the JSON that the GitHub REST API returned for the list of pull requests, the reviews of each and, when you have them, the issue events of each. GitHub writes every time in UTC: "Timestamps returned by the API are in UTC time, ISO 8601 format."
- **Three waits, two clocks.** First review, first approval and merge, each on the wall and in the working hours of the reviewer, the approver or the author. A wait starts when the pull request is first ready for review; time as a draft, or closed before it was reopened, is not counted.
- **The reviews that count.** Reviews by the author, by bots, reviews never submitted and reviews on the draft are not a first review; the report counts each kind.
- **No averages.** The median, an upper percentile and the longest wait, all by the nearest-rank method, so every number is a wait that happened.
- **Your limit.** The limit of a first review comes from the configuration, in working or wall minutes; there is no default.
- **Fails closed.** A missing timestamp, a missing list of reviews, an unknown review state, an unknown time zone or events that contradict the pull request stop the run instead of a guess.
- **Logins only.** No title, body, name or email address is read.
- **The same files give the same report.** The tool reads no clock and does not depend on the time zone or the locale of the machine. Time zone math with the Intl API of Node only.
- Reports as text, Markdown and JSON, with an exit code for a pipeline: `0` nothing past the limit, `1` something is, `2` usage or input error.
- Plain JavaScript, no dependencies.

```
npm test
```

```
tests 181
pass 179
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic link or a device (a link to `/dev/zero` named as an input, and a link to a regular file); they are guarded with `process.platform`, run on Linux and macOS, and none of them asserts a line or a column. `npm run test:coverage` runs the same tests with coverage; their time limits are four times wider when coverage is on. One test runs the whole example under other time zones and locales in child processes and compares the reports. The tests find the days on which zones move their clocks by asking Intl, so no test holds the date of a clock change.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/review-latency-check.git
cd review-latency-check
npm run example
```

`npm run example` runs the example below and prints its report. To run the command yourself on the same files:

```
node tools/example.mjs --write example-run
cd example-run
node ../bin/review-latency-check.js --pulls pulls.json --team team.json --config config.json --as-of latest --time-labels offset
```

Or without a clone, on your own files:

```
npx --yes github:INNERLUXES/review-latency-check --pulls pulls.json --team team.json --config config.json
```

The example is a made-up platform team of six in three time zones: Anke and Jonas in Berlin, Ben and Maya in New York, Lucia and Andres in Bogota, where the clocks do not move. Over five weeks they open 40 pull requests; two are opened by bots, one by a guest outside the team and one stays a draft. The data starts on a Monday shortly before New York moves its clocks forward; Berlin follows three weeks later. The team agreed that a first review comes within four working hours of the reviewer.

The example data is kept in `examples/pulls-plan.json` with every moment written as a day number and a time in UTC, because no file of this repository holds a date. `tools/example.mjs` turns it into a pull request file in the shape of the GitHub REST API when it runs, with real timestamps counted from the day number `20514` (that Monday), and runs

```
node bin/review-latency-check.js --pulls pulls.json --team team.json --config config.json --as-of latest --time-labels offset
```

in a temporary folder with the three files. `--time-labels offset` writes each moment as its distance from the first day, so the report holds no date either.

## Usage

```
review-latency-check --pulls <file> --team <file> --config <file> [options]
```

```
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
--help                    show the usage
--version                 show the version
```

The report of the example starts with what was read and the counts:

```
review-latency-check: pulls.json, team team.json (Example platform team), configuration config.json
team: 6 people in 3 time zones
  anke-dev   Europe/Berlin     mon-fri 09:00-17:30
  jonas-k    Europe/Berlin     mon-fri 08:00-16:30
  ben-ny     America/New_York  mon-fri 09:00-17:00
  maya-ny    America/New_York  mon-fri 08:30-12:30, 13:30-17:30
  lucia-co   America/Bogota    mon-fri 08:00-12:00, 13:00-17:00
  andres-co  America/Bogota    mon-fri 09:00-18:00
limit: a first review within 4h 00m (240 minutes) of the working hours of the reviewer
percentile: p90 and the median, both by the nearest-rank method
bots: *[bot], release-helper and every account of type Bot
data: day 0 (Mon) 08:30Z to day 32 (Fri) 18:00Z; open pull requests measured until --as-of day 32 (Fri) 18:00Z
clock changes: America/New_York from UTC-05:00 to UTC-04:00 on day 6 (Sun); Europe/Berlin from UTC+01:00 to UTC+02:00 on day 27 (Sun)
pulls: 40 read, 36 measured: 34 reviewed, 1 closed with no review, 1 open with no review; 33 approved, 33 merged; 4 left out
```

Then the pull requests past the limit:

```
Past the limit (6)

  #111  jonas-k (Europe/Berlin), first review by ben-ny (America/New_York) at day 4 (Fri) 21:00Z      7h 00m on the wall, 7h 00m working
  #116  jonas-k (Europe/Berlin), first review by anke-dev (Europe/Berlin) at day 8 (Tue) 12:30Z       4h 30m on the wall, 4h 30m working
  #119  maya-ny (America/New_York), no review, closed at day 11 (Fri) 19:00Z                          47h 00m on the wall, 31h 00m working
  #123  jonas-k (Europe/Berlin), first review by maya-ny (America/New_York) at day 14 (Mon) 13:00Z    70h 00m on the wall, 6h 00m working
  #127  andres-co (America/Bogota), no review, still open at --as-of day 32 (Fri) 18:00Z              388h 00m on the wall, 189h 00m working
  #138  maya-ny (America/New_York), first review by lucia-co (America/Bogota) at day 32 (Fri) 17:30Z  28h 30m on the wall, 12h 00m working
```

The first reviews of each pair of zones, with the median, the 90th percentile and the longest wait, on the wall and in the working hours of the reviewer:

```
First review by author zone and reviewer zone (wall / working hours of the reviewer)

                                             wall                       working
  author zone       reviewer zone     pulls  median   p90      max      median   p90      max
  America/Bogota    America/Bogota    1      1h 40m   1h 40m   1h 40m   1h 10m   1h 10m   1h 10m
  America/Bogota    America/New_York  4      0h 30m   16h 00m  16h 00m  0h 30m   1h 40m   1h 40m
  America/Bogota    Europe/Berlin     5      16h 10m  59h 20m  59h 20m  0h 20m   1h 00m   1h 00m
  America/New_York  America/Bogota    5      2h 00m   28h 30m  28h 30m  1h 30m   12h 00m  12h 00m
  America/New_York  America/New_York  1      1h 30m   1h 30m   1h 30m   1h 30m   1h 30m   1h 30m
  America/New_York  Europe/Berlin     5      16h 15m  18h 20m  18h 20m  1h 00m   2h 50m   2h 50m
  Europe/Berlin     America/Bogota    3      3h 30m   7h 10m   7h 10m   0h 40m   1h 00m   1h 00m
  Europe/Berlin     America/New_York  8      5h 50m   70h 00m  70h 00m  0h 20m   7h 00m   7h 00m
  Europe/Berlin     Europe/Berlin     2      1h 30m   4h 30m   4h 30m   1h 00m   4h 30m   4h 30m
```

The three waits over every pull request:

```
Every measured pull together

                                           wall                      working
  wait            working hours of  pulls  median  p90      max      median   p90     max
  first-review    the reviewer      34     4h 55m  28h 30m  70h 00m  1h 00m   4h 30m  12h 00m
  first-approval  the approver      33     7h 30m  57h 10m  71h 00m  1h 30m   5h 00m  12h 00m
  merge           the author        33     9h 00m  58h 00m  72h 00m  5h 00m   8h 00m  13h 00m
```

And every pull request, with a star after each one past the limit:

```
Every pull (wall / working; * past the limit)

  #101   anke-dev   ready day 0 (Mon) 08:30Z   review ben-ny 5h 50m / 0h 20m          approval 7h 30m / 2h 00m    merge 8h 00m / 8h 00m
  #102   ben-ny     ready day 0 (Mon) 15:00Z   review anke-dev 17h 40m / 2h 10m       approval 17h 40m / 2h 10m   merge 18h 00m / 7h 00m
  #103   lucia-co   ready day 0 (Mon) 13:30Z   review andres-co 1h 40m / 1h 10m       approval 1h 40m / 1h 10m    merge 2h 30m / 2h 30m
  #104   jonas-k    ready day 1 (Tue) 07:30Z   review anke-dev 1h 30m / 1h 00m        approval 5h 30m / 5h 00m    merge 6h 00m / 6h 00m
  #105   maya-ny    ready day 1 (Tue) 21:00Z   review jonas-k 10h 45m / 0h 45m        approval 10h 45m / 0h 45m   merge 17h 00m / 2h 00m
  #106   andres-co  ready day 1 (Tue) 22:30Z   review ben-ny 16h 00m / 0h 30m         approval 16h 00m / 0h 30m   merge 16h 30m / 1h 30m
  #107   anke-dev   ready day 2 (Wed) 13:00Z   review maya-ny 2h 00m / 1h 30m         approval 2h 00m / 1h 30m    merge 2h 30m / 2h 30m
  #108   ben-ny     ready day 3 (Thu) 14:30Z   review lucia-co 1h 30m / 1h 30m        approval 2h 30m / 2h 30m    merge 3h 30m / 3h 30m
  #110   lucia-co   ready day 4 (Fri) 20:00Z   review jonas-k 59h 20m / 0h 20m        approval 59h 20m / 0h 20m   merge 60h 00m / 2h 00m
  #111*  jonas-k    ready day 4 (Fri) 14:00Z   review ben-ny 7h 00m / 7h 00m          approval 66h 30m / 3h 00m   merge 67h 00m / 3h 30m
  #112   maya-ny    ready day 7 (Mon) 13:00Z   review andres-co 2h 00m / 1h 00m       approval 2h 00m / 1h 00m    merge 3h 00m / 3h 00m
  #113   anke-dev   ready day 7 (Mon) 10:00Z   review lucia-co 3h 30m / 0h 30m        approval 28h 00m / 9h 00m   merge 28h 30m / 13h 00m
  #114   andres-co  ready day 7 (Mon) 16:00Z   review anke-dev 16h 10m / 0h 40m       approval 17h 00m / 2h 00m   merge 18h 00m / 7h 00m
  #115   ben-ny     ready day 8 (Tue) 13:30Z   review maya-ny 1h 30m / 1h 30m         approval 1h 30m / 1h 30m    merge 2h 30m / 2h 30m
  #116*  jonas-k    ready day 8 (Tue) 08:00Z   review anke-dev 4h 30m / 4h 30m        approval 4h 30m / 4h 30m    merge 5h 00m / 5h 00m
  #118   lucia-co   ready day 9 (Wed) 13:10Z   review ben-ny 0h 30m / 0h 30m          approval 0h 30m / 0h 30m    merge 0h 50m / 0h 50m
  #119*  maya-ny    ready day 9 (Wed) 20:00Z   review none, closed 47h 00m / 31h 00m  approval -                  merge -
  #120   anke-dev   ready day 10 (Thu) 08:15Z  review ben-ny 4h 55m / 0h 10m          approval 4h 55m / 0h 10m    merge 5h 15m / 5h 15m
  #121   andres-co  ready day 10 (Thu) 21:00Z  review jonas-k 10h 10m / 0h 10m        approval 10h 10m / 0h 10m   merge 11h 00m / 2h 00m
  #122   ben-ny     ready day 11 (Fri) 12:00Z  review lucia-co 2h 00m / 1h 00m        approval 2h 30m / 2h 30m    merge 3h 00m / 2h 00m
  #123*  jonas-k    ready day 11 (Fri) 15:00Z  review maya-ny 70h 00m / 6h 00m        approval 71h 00m / 7h 00m   merge 72h 00m / 8h 30m
  #124   lucia-co   ready day 14 (Mon) 13:20Z  review ben-ny 1h 40m / 1h 40m          approval 19h 40m / 4h 10m   merge 20h 40m / 7h 40m
  #125   maya-ny    ready day 14 (Mon) 13:00Z  review andres-co 6h 00m / 4h 00m       approval 6h 00m / 4h 00m    merge 7h 00m / 6h 00m
  #126   anke-dev   ready day 15 (Tue) 08:00Z  review maya-ny 4h 40m / 0h 10m         approval 4h 40m / 0h 10m    merge 5h 00m / 5h 00m
  #127*  andres-co  ready day 16 (Wed) 14:00Z  review none, open 388h 00m / 189h 00m  approval -                  merge -
  #129   ben-ny     ready day 17 (Thu) 13:00Z  review anke-dev 1h 00m / 1h 00m        approval 19h 20m / 3h 50m   merge 20h 00m / 8h 00m
  #131   lucia-co   ready day 21 (Mon) 13:00Z  review maya-ny 0h 30m / 0h 30m         approval 0h 30m / 0h 30m    merge 1h 00m / 1h 00m
  #132   anke-dev   ready day 22 (Tue) 15:00Z  review andres-co 1h 00m / 1h 00m       approval 1h 30m / 1h 30m    merge 17h 00m / 1h 30m
  #133   maya-ny    ready day 23 (Wed) 12:45Z  review jonas-k 18h 20m / 2h 50m        approval 19h 15m / 3h 45m   merge 19h 45m / 7h 45m
  #134   andres-co  ready day 25 (Fri) 22:00Z  review anke-dev 57h 10m / 0h 10m       approval 57h 10m / 0h 10m   merge 58h 00m / 1h 00m
  #135   jonas-k    ready day 28 (Mon) 06:30Z  review ben-ny 6h 50m / 0h 20m          approval 8h 30m / 2h 00m    merge 9h 00m / 8h 00m
  #136   ben-ny     ready day 29 (Tue) 14:00Z  review jonas-k 16h 15m / 0h 45m        approval 16h 15m / 0h 45m   merge 17h 00m / 7h 00m
  #137   lucia-co   ready day 30 (Wed) 13:00Z  review anke-dev 1h 00m / 1h 00m        approval 2h 00m / 1h 00m    merge 3h 00m / 3h 00m
  #138*  maya-ny    ready day 31 (Thu) 13:00Z  review lucia-co 28h 30m / 12h 00m      approval 28h 30m / 12h 00m  merge 29h 00m / 12h 00m
  #139   anke-dev   ready day 32 (Fri) 07:30Z  review andres-co 7h 10m / 0h 40m       approval 7h 10m / 0h 40m    merge 8h 30m / 8h 00m
  #140   jonas-k    ready day 32 (Fri) 08:10Z  review maya-ny 6h 40m / 2h 20m         approval -                  merge -
```

The exit code is `1`. #111 was reviewed on a Friday evening in Berlin, but Ben in New York had been at work for seven hours by then. #123 was opened on a Friday afternoon in Berlin and reviewed on Monday from New York: 70 hours on the wall, 6 hours of Maya's working time. #110 and #134 crossed a weekend and are not late: Jonas and Anke reviewed them twenty and ten minutes into their Monday. #125 waited exactly four working hours, which is not past a limit of four hours. #119 was closed with no review and #127 is still open with none; their working wait counts the hours in which anyone else of the team was at work. `--explain` shows the spans behind each number; for #123:

```
  #123*  jonas-k    ready day 11 (Fri) 15:00Z  review maya-ny 70h 00m / 6h 00m        approval 71h 00m / 7h 00m   merge 72h 00m / 8h 30m
      ready for review and open: day 11 (Fri) 15:00Z-day 14 (Mon) 15:00Z
      first review: maya-ny (America/New_York), COMMENTED, at day 14 (Mon) 13:00Z
        on the wall: day 11 (Fri) 15:00Z-day 14 (Mon) 13:00Z = 70h 00m
        working hours of maya-ny (America/New_York, UTC-04:00 at the start): day 11 (Fri) 15:00Z-16:30Z, day 11 (Fri) 17:30Z-21:30Z, day 14 (Mon) 12:30Z-13:00Z = 6h 00m
      first approval: maya-ny (America/New_York) at day 14 (Mon) 14:00Z
        on the wall: day 11 (Fri) 15:00Z-day 14 (Mon) 14:00Z = 71h 00m
        working hours of maya-ny (America/New_York, UTC-04:00 at the start): day 11 (Fri) 15:00Z-16:30Z, day 11 (Fri) 17:30Z-21:30Z, day 14 (Mon) 12:30Z-14:00Z = 7h 00m
      merge: at day 14 (Mon) 15:00Z
        on the wall: day 11 (Fri) 15:00Z-day 14 (Mon) 15:00Z = 72h 00m
        working hours of the author jonas-k (Europe/Berlin, UTC+01:00 at the start): day 11 (Fri) 15:00Z-15:30Z, day 14 (Mon) 07:00Z-15:00Z = 8h 30m
```

[examples/output](examples/output) holds the report as text, with `--explain`, as Markdown and as JSON. `npm run example` runs the example again, checks it against this README, and writes those files; CI fails when they change.

## What it measures

| Wait | From | To | Working hours of |
| --- | --- | --- | --- |
| `first-review` | the moment the pull request was first ready for review | the first review by a person of the team who is not the author | the reviewer |
| `first-approval` | the same | the first review in the state `APPROVED` | the approver |
| `merge` | the same | `merged_at` | the author |

The check `first-review-limit` decides the exit code: a pull request is past the limit when its first review came later than `firstReviewLimit.minutes` after its start, on the measure of `firstReviewLimit.measure`. A pull request with no review is past the limit when it waited that long before it was closed, or before `--as-of`. A wait of exactly the limit is not past it.

Only time in which the pull request was open and ready counts. A pull request opened as a draft starts at its `ready_for_review` event; time as a draft again, or closed before it was reopened, is left out. A review is not a first review when it is by the author, by a bot (`user.type` `Bot`, or a pattern of `bots`), never submitted (`PENDING`), with no reviewer, submitted before the pull request was first ready, or by a login outside the team. [docs/method.md](docs/method.md) gives every step.

For every pair of author zone and reviewer zone, and for all pull requests together, the report gives the count, the median, an upper percentile and the longest wait. Percentiles use the nearest-rank method: the p-th percentile of n waits sorted from short to long is the wait at rank ceil(p x n / 100), counted from 1. The median is the 50th percentile by the same rule, the lower of the two middle waits for an even count. There is no average.

## How the time is counted

Each shift of the team file is written in local time and turned into a moment of UTC with the offset that the zone has at that moment, read from `Intl.DateTimeFormat(...).formatToParts`. The working wait is the overlap of those moments with the time the pull request was waiting. When New York moves its clocks forward, Ben's 09:00 moves from 14:00Z to 13:00Z, and a review at 13:10Z is ten minutes into his day instead of before it.

Two local times need a rule of their own:

| Local time | Read as |
| --- | --- |
| skipped when the clocks move forward | the same time on the clock before the change, which lands that far after the gap |
| repeated when the clocks move back | the first of the two |

A shift with such a time gets a note in the report. A time zone is an IANA name such as `Europe/Berlin`; an unknown name or a bare UTC offset stops the run.

## The pull request file

One JSON object with the responses you saved from the GitHub REST API. [docs/inputs.md](docs/inputs.md) lists every field the tool reads, quotes the documentation of each, and shows one way to export the data with the GitHub CLI.

```json
{
  "pulls": [ ...GET /repos/{owner}/{repo}/pulls?state=all... ],
  "reviews": { "101": [ ...GET /repos/{owner}/{repo}/pulls/101/reviews... ] },
  "events": { "101": [ ...GET /repos/{owner}/{repo}/issues/101/events... ] }
}
```

| Object | Fields read |
| --- | --- |
| pull request | `number`, `state`, `draft`, `user.login`, `user.type`, `created_at`, `closed_at`, `merged_at` |
| review | `user.login`, `user.type`, `state`, `submitted_at` |
| issue event | `event` and `created_at` of `ready_for_review`, `convert_to_draft`, `closed`, `reopened` and `merged` |

Every pull request needs its list of reviews, `[]` for none, so a missing export is never read as no review. The events are optional: without them, a pull request is ready from `created_at`, and a note names it. Every other field (titles, bodies, names, email addresses, addresses) is skipped unread.

## The team file

[examples/team.json](examples/team.json):

```json
{
  "name": "Example platform team",
  "people": [
    { "login": "anke-dev", "zone": "Europe/Berlin", "hours": { "mon-fri": ["09:00-17:30"] } },
    { "login": "jonas-k", "zone": "Europe/Berlin", "hours": { "mon-fri": ["08:00-16:30"] } },
    { "login": "ben-ny", "zone": "America/New_York", "hours": { "mon-fri": ["09:00-17:00"] } },
    { "login": "maya-ny", "zone": "America/New_York", "hours": { "mon-fri": ["08:30-12:30", "13:30-17:30"] } },
    { "login": "lucia-co", "zone": "America/Bogota", "hours": { "mon-fri": ["08:00-12:00", "13:00-17:00"] } },
    { "login": "andres-co", "zone": "America/Bogota", "hours": { "mon-fri": ["09:00-18:00"] } }
  ]
}
```

Hours are keyed by a day of the week (`mon` to `sun`) or a range such as `mon-fri`; two shifts on a day are a split shift, and a shift across midnight is written as two. A person can have `daysOff`, written as dates. Logins are compared without case; a key the tool does not know stops the run, with its line and a suggestion.

## The configuration

[examples/config.json](examples/config.json):

```json
{
  "firstReviewLimit": { "measure": "working", "minutes": 240 },
  "percentile": 90,
  "bots": ["*[bot]", "release-helper"],
  "unknownLogins": "exclude"
}
```

| Key | Default | What |
| --- | --- | --- |
| `firstReviewLimit` | none, required | `measure` is `working` or `wall`, `minutes` a whole number |
| `percentile` | 90 | the upper percentile next to the median, 50 to 100 |
| `bots` | none | logins or patterns with `*`; accounts of type `Bot` are bots in any case |
| `unknownLogins` | `fail` | `fail` stops the run on a login outside the team, `exclude` leaves it out with a note |

## Dates

The tool reads no clock. Every moment comes from the input, and an open pull request with no review is measured only until `--as-of`. Labels hold no year by default: `--time-labels date` writes `Mon 02 Mar 14:05Z`, `offset` writes `day 3 (Thu) 14:05Z`, and only `iso` writes full timestamps. The example uses `offset`, and keeps its moments as day numbers, so no file of the repository holds a date; [the decision](docs/decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md) explains why.

## Privacy

The tool reads the login and the account type of each author and reviewer, the states and the times, and nothing else: no title, no body, no name, no email address. The reports show logins, time zones, working hours, pull request numbers, times and waits; a login outside the team is never shown. A report of review times can be read as a report on people, so agree with the team what is measured and post the report where the team reads it. The tool writes nothing to disk except the report that `--out` names, and refuses an input as the `--out` path. [docs/secure-defaults.md](docs/secure-defaults.md) explains the defaults; [docs/threat-model.md](docs/threat-model.md) lists the risks and their controls.

## Formats

- `text`: for a terminal: what was read, the clock changes, the counts, the pull requests past the limit, the pairs of zones, the three waits together, every pull request, the notes and the result. With `--explain` also the spans behind each number and the sentences the measures rest on.
- `markdown`: the same for a ticket or a job summary, as tables. Pipes, square brackets, backticks, asterisks, underscores, line breaks and angle brackets from the input are escaped, and a cell that starts with `=`, `+`, `-` or `@` gets a leading apostrophe.
- `json`: the whole report, with every wait in whole minutes.

## Exit codes

`0`: no pull request waited past the limit. `1`: at least one did. `2`: a usage or input error: an option missing or given twice, an unknown option, a file that cannot be read, a key the tool does not know or named twice, a configuration with no limit, a missing or broken timestamp, a missing list of reviews, an unknown review state, times or events that contradict each other, an unknown time zone or a UTC offset, a login outside the team with `"unknownLogins": "fail"`, or a run with nothing to measure. With exit code `2` the tool gives no verdict and prints the problems on standard error.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the three files, measures every pull request and builds the report |
| `src/github.js` | the reader of the pull request file: the fields read, and every case that fails closed |
| `src/team.js`, `src/config.js`, `src/strict.js` | the strict readers of the team file and the configuration |
| `src/timeline.js` | the spans in which a pull request was open and ready for review |
| `src/hours.js` | the working hours of each person as moments of UTC |
| `src/metrics.js` | the three waits of a pull request, and which reviews count |
| `src/stats.js` | the median and the percentile by the nearest-rank method |
| `src/zones.js` | time zone names, offsets from Intl, local times to UTC with the rule for skipped and repeated times, clock changes |
| `src/intervals.js` | lists of moments: join, overlap, cut, length |
| `src/days.js` | timestamps, days and labels without a clock |
| `src/logins.js` | logins without case, and bot patterns |
| `src/rules.js` | the three waits and the check, with the sentences they rest on |
| `src/json.js` | the strict JSON reader |
| `src/files.js` | bounded reading of the inputs, and the one write of `--out` |
| `src/report.js`, `src/text.js`, `src/size.js` | the reports, the cleaning of text from the input, number formats |
| `src/data.js` | the sentences the tool rests on, compared with the saved pages in `research/sources` |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the example with its real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| The fields of pull requests, reviews and issue events, and that timestamps are in UTC | GitHub Docs, the REST API pages on pull requests, reviews, issue events, issue event types and time zones, https://docs.github.com/en/rest |
| How Intl resolves a time zone name and refuses an unknown one | ECMA-402, the ECMAScript Internationalization API Specification, https://tc39.es/ecma402/ |
| That time zone rules change | IANA, https://www.iana.org/time-zones and https://www.iana.org/time-zones/theory |
| Comparing in UTC, and the form of a timestamp | RFC 3339, https://www.rfc-editor.org/rfc/rfc3339.txt |
| Repeated names in a JSON object | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |

[docs/rules-and-sources.md](docs/rules-and-sources.md) lists every quoted sentence with the saved page it comes from.

## Limits

The tool measures the reviews in the data. It cannot see reviews given in a call or in a message, who was asked to review, absences that are not in the team file, or who merged a pull request; a list of reviews or events that misses a page gives wrong numbers. The offsets come from the time zone data of the Node that runs it. A pair of zones with one or two pull requests has a median, but it says little; the count is always shown next to it. [docs/limits.md](docs/limits.md) lists these, with the size limits.

## Background

Teams that work with engineers from nearby countries usually count on a few shared hours a day, and a review that misses them waits for the next one. How such teams are set up is described on the page [Nearshore Software Development Services](https://innerluxes.dev/software-development/nearshore).

## License

MIT
