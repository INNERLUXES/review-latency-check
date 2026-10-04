## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run test:coverage`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a measure, the check, the percentile method, the time zone math or a reader is described in docs/method.md or docs/inputs.md, says what it can and cannot see, and has a test with the files written inline and a near miss on each side of the limit
- [ ] No limit is built in: the number the check compares comes from the configuration
- [ ] Every field read from a GitHub object is listed in `PULL_FIELDS`, `REVIEW_FIELDS` or `EVENT_FIELDS`, documented in docs/inputs.md and quoted from a page saved in research/sources
- [ ] Input that cannot be read still fails closed: a missing or broken timestamp, a missing review list, an unknown state, times that contradict each other, events that contradict the pull
- [ ] Time zones still fail closed: an unknown name, a name Intl.supportedValuesOf does not list and a UTC offset stop the run, with no fallback
- [ ] Every Intl call passes a time zone, a moment and the locale, and Intl.DateTimeFormat is used in src/zones.js only
- [ ] A test that needs a clock change finds its day with `changeDay()` and builds timestamps with `at()`; no test holds a date
- [ ] A change to a quoted sentence follows the saved page: the new page text is saved in research/sources, `src/data.js` and docs/rules-and-sources.md match it, and nothing was added from memory
- [ ] Text from the input goes through `safeText` before it reaches a report, a note or an error message, and no report shows a field of the input other than logins, time zones, pull numbers and times
- [ ] The tool still opens no network connection, reads no token, runs no program, reads no clock and writes nothing but the report `--out` names
- [ ] Work stays bounded: the limits of docs/limits.md hold, and a hostile test has a time check that widens under coverage through `NODE_V8_COVERAGE`
- [ ] A test that depends on the operating system (a link, a device) is guarded with `process.platform`, asserts no line or column of its own, and builds its paths with `resolve()` from forward-slash names
- [ ] No real person, team, login or email address in fixtures or examples, no date, and no number that reads like a year anywhere
- [ ] The commit messages of this pull request follow Conventional Commits
