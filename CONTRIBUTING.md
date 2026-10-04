# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, with `!` for a breaking change.

## Changing a measure or the check

1. Describe the change in docs/method.md first: where the wait starts and ends, whose working hours count, which reviews count, and what the measure can and cannot see. Where the tool makes its own choice, say so and say why.
2. The tool has no limit of its own, and a change must not add one. The number the check compares comes from the configuration.
3. A run must never pass with nothing measured, and input that cannot be read stops the run with exit code `2`.
4. Add a test with the files written inline (`pull()`, `review()`, `event()`, `pullsFile()` and `reportOf()` in test/helpers.js build them), small enough that the result can be worked out by hand, with a near miss on each side of the limit.
5. A measure id, once released, keeps its meaning: pipelines and other tools read it from the JSON report.

## Changing the percentile method

The median and the upper percentile use the nearest-rank method, so every number in a report is a wait that happened. A change to the method changes docs/method.md, the tests of src/stats.js and the examples, and never adds an average.

## Changing the time zone math

1. Intl is the only source of offsets. Never add a copy of the time zone database, a table of offsets or a rule of a country.
2. Every Intl call passes a time zone, a moment and the locale `en-US`, and `Intl.DateTimeFormat` stays in src/zones.js. ECMA-402 reads the zone of the machine without a time zone, and the clock without a moment.
3. Time zones fail closed. A name that Intl does not know, a primary name that `Intl.supportedValuesOf('timeZone')` does not list, and a UTC offset stop the run; there is no fallback.
4. The rule for local times that the clocks skip or repeat is written in docs/method.md; a change to it changes that text and the tests of both nights.
5. A test that needs a clock change finds its day with `changeDay()` of test/helpers.js, by asking Intl, and never holds the date of a clock change. `test/locale.test.js` runs the example under other time zones and locales in child processes.

## Changing what is read from GitHub

1. A field is read only when the saved page of research/sources documents it. Save the page text first, then add the field to `PULL_FIELDS`, `REVIEW_FIELDS` or `EVENT_FIELDS` in src/github.js, describe it in docs/inputs.md, and test a good value, a bad one and a missing one.
2. A field that the measures need fails closed when it is missing or broken. Never fill in a default that changes a number without a note.
3. Never read a title, a body, a name or an email address, and never show any field of the input but logins, time zones, pull numbers and times.
4. The three top-level keys stay strict. Inside a GitHub object other fields stay allowed, because GitHub sends many of them.

## Changing the team file or the configuration

1. A new key is added to `TEAM_KEYS`, `PERSON_KEYS` or `CONFIG_KEYS`, documented in docs/inputs.md, and tested with a good value and a bad one. Every key the tool does not know stays an error, and an object that names a key twice stays refused.
2. A number is a whole number, checked for its range.
3. People stay named by login. Never add a field for a name or an email address.

## Changing a reader

1. The tool reads; it never runs. A reader must not fetch anything a file names, follow anything but own properties, or build a pattern from the input.
2. Keep the work bounded: the limits of docs/limits.md, and a hostile test with a large input and a time check.
3. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only when coverage is on, and allow four times the time. Never read the flags of the process for this, because they hold the coverage flags of the runner in every run. Run `npm run test:coverage` before you open the pull request.
4. Files written with LF and with CRLF line ends must give the same report. The example inputs are stored as written (`.gitattributes`), and a test reads them both ways.
5. Paths are opened with `path.resolve`. Paths shown in a report are relative, with forward slashes.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device) is guarded with `process.platform`, says why in its `t.skip`, and asserts no line or column of its own: a line or column is asserted only in a test that runs on every system, and is worked out there with `lineOf()` of test/helpers.js or from the text itself, never written by hand. `test/repo.test.js` fails when a guarded test asserts a line or a column. Every other test builds its paths with `resolve()` from names with forward slashes.

A test never reads the clock and never holds a date: it builds a timestamp from a day number with `at()` of test/helpers.js.

## Personal data

Never commit real pull request data or a real team file, even as a fixture. Examples and tests use made-up logins.

## Rules for the code

- No runtime dependencies. Node 22 or newer and nothing else.
- The tool reads the three files it is given and writes only to the screen or to the file `--out` names. It opens no network connection, reads no token or environment variable, runs no program, reads no clock and makes no Date object.
- Text from the input goes through `safeText` before it reaches a report, a note or an error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- Never commit a real secret, even as a fixture. `npm run check` fails on anything that looks like a credential.
- No file carries a date, and no file holds a number that reads like a year. Version numbers (Node 22, 1.0.0), the numbers of a standard (RFC 3339, ECMA-402) and day numbers such as 20514 are fine. The example keeps its moments as day numbers, and `tools/example.mjs` makes the timestamps when it runs.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
