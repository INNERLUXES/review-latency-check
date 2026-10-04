# Secure defaults

The default run is the safe run. Nothing in the first two sections needs a flag, and none of it can be switched off. The rest of the document is about what the tool cannot do for you: where the data comes from, where a report goes, and who may change the team file and the configuration.

## How the tool behaves by default

- **No API, no token.** The tool reads files the user saved. It opens no network connection, reads no environment variable and no token, and refuses an argument that looks like an address. Whoever exports the data does so with their own login and their own tools; the tool never sees the token.
- **No clock, no machine settings.** The tool reads no clock and makes no Date object: every moment comes from the input, or from `--as-of`. It passes a time zone and a moment to every Intl call, so the zone and the locale of the machine never enter a result. A test runs the example under four time zones and locales and compares the reports.
- **No limit of its own.** The limit of the check comes from the configuration, and a configuration without it is refused. The defaults (the 90th percentile, no bot patterns, stop on an unknown login) choose what is shown and how strict the tool is; none of them moves a verdict towards a pass.
- **Unknown keys are errors.** A key the tool does not know in the team file, the configuration or the top level of the pull request file stops the run, with its line and a suggestion, so a typo cannot switch the limit off. A key named twice stops the run in any object.
- **Fail closed on data.** A missing or broken timestamp, a submitted review without `submitted_at`, a pull request whose reviews were not given, an unknown review state, times that contradict each other and events that contradict the pull request stop the run. A run in which nothing is left to measure gives no verdict instead of a pass.
- **Fail closed on logins.** A login that is not in the team file stops the run unless the configuration says to leave it out, because its working hours are unknown.
- **Fail closed on time zones.** A name that Intl does not know, a name whose primary name `Intl.supportedValuesOf('timeZone')` does not list, and a bare UTC offset stop the run. The tool never falls back to UTC or to the zone of the machine.
- **Bounded work.** The files, the pull requests, the reviews, the events, the people and the patterns have limits (docs/limits.md); the offsets of a zone are read once a day and kept, and the working hours of a person are cut by binary search.
- **No regular expression from the input.** No pattern is built from the input. Bot patterns are matched by a loop, so a pattern full of `*` cannot make the match slow.
- **No prototype tricks.** JSON objects are built with own properties and people are kept in maps, so a key or a login such as `__proto__` is just text.
- **Clean output.** Every text from the input is cleaned and capped before it reaches a report or an error message. Markdown cells escape pipes, backslashes, square brackets, backticks, asterisks, underscores, line breaks and `<`, `>` and `&`, and a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe, so a table pasted into a spreadsheet is not read as a formula.
- **No programs.** The tool starts no program and evaluates nothing it reads.
- **No dependencies.** Node 22 or newer and nothing else.

## Personal data

Pull request data says who wrote and reviewed what, and when; the team file says where people live, by their time zone, and when they work. That is personal data, and the tool keeps it small:

- **Logins only.** The tool reads the login and the account type of each author and reviewer, and nothing else about them: no name, no email address, no avatar. The team file has no field for a name or an email address, and a login with an `@` is refused.
- **No content.** Titles, bodies, comments and every other field of a pull request or a review are skipped unread and never reach a report.
- **Only what the measures need.** The reports show logins, time zones, working hours, pull request numbers, times and waits. A login outside the team is never shown, not even in a note.
- **No year by default.** The default labels (`--time-labels date`) show the day and the month but no year; `offset` shows no date at all. Prefer `offset` for a report that is kept a long time or shared widely.
- **Nothing is written to disk but the report that `--out` names.** The tool keeps no cache, no history and no temporary file. With `--out` the file is created for its owner only where the system has file permissions, and an input is refused as an `--out` path.

Before you run it and post a report:

- A report of review times can be read as a report on people. Agree with the team what is measured and why, and post the report where the team reads it.
- Keep the team file where the team can read it and agree with it; it describes their working days.
- Delete the exported data when it is no longer needed; it holds more than the tool reads.

## The pipeline

- **Pin Node.** The offsets come from the time zone data built into Node. A pipeline that runs the tool on a fixed Node version gives the same report for the same files.
- **Export with the least rights.** The export needs read access to pull requests only. Keep the token in the secret store of the pipeline, never in a file the tool reads.
- **Give `--as-of` from the pipeline, or `latest`.** The tool reads no clock; the pipeline decides until when open pull requests are measured.
- **Review the team file and the configuration.** Whoever can change them can change the working hours and the limit. Keep them under review like code.

## Secure development

The repository follows the practices of NIST SP 800-218, the Secure Software Development Framework: every change goes through review with CODEOWNERS, CI runs the tests on three systems and two Node versions, CodeQL scans the code, Dependabot watches the pinned actions, every action is pinned to a commit, and a release is packed only after the SSDF check of the repository passes, with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation.
