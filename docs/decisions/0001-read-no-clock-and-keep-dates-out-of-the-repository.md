# 1. Read no clock, and keep dates out of the repository

## Status

Accepted.

## Context

The tool measures waits between moments that are in the data: when a pull request was opened or marked ready, when it was reviewed, merged or closed. One wait has no end in the data: an open pull request that nobody has reviewed yet. The obvious end is now, read from the clock of the machine.

A clock makes the same files give a different report from one hour to the next. A pipeline that passes in the morning can fail in the afternoon with nothing changed, and a report saved in a ticket can no longer be reproduced. A test that reads the clock passes on one day and fails on another.

Time zones make this worse. Intl reads the time zone of the machine when it is not given one, and ECMA-402 says so in the steps of CreateDateTimeFormat: "If timeZone is undefined, then Set timeZone to SystemTimeZoneIdentifier()." `formatToParts` reads the clock when it is not given a moment: "If date is undefined, then Let x be ! Call(%Date.now%, undefined)."

The repository itself has a second constraint: no file may hold a date or a number that reads like a year. That covers the example data, the saved example reports and every test. But the input of the tool holds real timestamps, with years, because GitHub writes them that way: "Timestamps returned by the API are in UTC time, ISO 8601 format." An example input with real timestamps would break the rule, and the clock changes the example shows only happen on real days.

## Decision

1. The tool reads no clock, makes no Date object and draws no random number. An open pull request with no review is measured only until `--as-of`, which is `latest` (the last moment anywhere in the pull request file) or a timestamp. Without `--as-of` it has no end, and a note says so. `test/repo.test.js` looks for `Date.now(`, `new Date(`, `Date.parse(`, `Math.random`, `getTimezoneOffset` and the locale date functions in `src` and fails if one appears.
2. Every Intl call gets a time zone, a moment and the locale `en-US`, and `Intl.DateTimeFormat` is used in `src/zones.js` only. `test/repo.test.js` checks both.
3. A timestamp is read with one strict pattern and `Date.UTC`, which does not depend on the time zone or the locale. A moment is written back by arithmetic on its day number, with the days-from-civil algorithm run backwards.
4. The labels of the reports hold no year by default. `--time-labels date` writes a moment as the day of the week, the day and the month and the time in UTC; `--time-labels offset` writes it as its distance from the UTC day of the first pull request (`day 3 (Thu) 14:05Z`), so a report holds no date at all; `--time-labels iso` writes the full timestamp, with its year, for a reader that needs it.
5. The example keeps its pull requests in `examples/pulls-plan.json` with every moment written as a day number counted from the first day of the example and a time in UTC (`"3 14:30"`). `tools/example.mjs` turns the plan into a pull request file in the shape of the GitHub REST API when it runs, with real timestamps computed from the day number `20514` (a Monday, shortly before New York moves its clocks), writes it with the team file and the configuration into a temporary folder, runs the tool there with `--as-of latest --time-labels offset`, and removes the folder. `node tools/example.mjs --write <dir>` writes the three files into a folder of your choice, to run the tool by hand.
6. The tests build timestamps at run time from day numbers with `at()` of `test/helpers.js`, and find the days on which a zone moves its clocks by asking Intl with `changeDay()`, so no test holds a date. `npm run check` and `test/repo.test.js` look for year-like numbers in every file.
7. Days off in the team file are dates, because a person's day off is a real day. The example has none.

## Consequences

- The same files and arguments give the same report on every machine and at every hour, for as long as the time zone data of Node gives the same offsets for those days.
- A pipeline that wants to measure open pull requests up to the moment of its run passes `--as-of latest`, or writes the moment of the run into the command. The choice is visible in the command.
- The example shows real clock changes: the day number of its first day is fixed, and the days on which New York and Berlin move their clocks are those of the time zone data.
- The example input is not a file of the repository. A reader who wants to see it runs `node tools/example.mjs --write <dir>`; the plan it is made from is small and readable.
- Reports with the default labels name the day and the month. A report kept for a long time or shared widely is better made with `--time-labels offset`.
