# Threat model

## What the tool touches

- It reads the three files named on the command line. Nothing else is opened.
- It asks the Intl API of Node for time zone offsets, always with a time zone and a moment.
- It writes the report to the screen, or to the one file `--out` names. It writes nothing else.
- It opens no network connection, calls no API, reads no token or environment variable, evaluates nothing it reads, starts no program and reads no clock.

## What the input may hold

The pull request file is exported from GitHub, often by a script, and holds text that anyone who can open a pull request chose: titles, bodies, branch names and logins. The team file and the configuration are often kept in a repository and changed by many people.

Through these files, a person can try to:

- move the verdict: a key named twice, an unknown key that looks like a known one, a configuration with no limit, a review state the tool does not know, a timestamp in a form that could be read two ways, a time zone written as an offset so that it never moves with the clocks, a list of reviews left out so that a pull request looks unreviewed, a list of events cut short so that a draft looks ready;
- hide a wait: a run in which nothing is measured, so that it passes with nothing checked; a reviewer named as a bot; a login outside the team whose reviews would count with unknown hours;
- exhaust the memory or the time: a file of tens of megabytes, JSON nested very deep, thousands of pull requests with long lists of reviews and events, a bot pattern full of `*`;
- rewrite the terminal or break a report: control characters, ANSI escapes, direction controls and line separators in a login or a team name, and pipes, brackets and angle brackets that a Markdown table would render;
- run a formula: a team name that starts with `=`, `+`, `-` or `@`, which a spreadsheet would run when a Markdown table of the report is pasted into it;
- change how objects behave: a key or a login such as `__proto__`, `constructor` or `toString`;
- leak personal data: a title, a body, a name or an email address that the export holds, reaching a report that more people read than the team.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A key named twice or an unknown key moves the verdict | The JSON reader refuses a repeated key in any object, as RFC 8259 says the behavior of software that receives one is unpredictable; an unknown key in the team file, the configuration or the top of the pull request file stops the run with its line |
| The check runs with a limit nobody chose | The limit has no default; a configuration without it is refused |
| A missing export reads as no review, or a cut list of events as a ready pull request | Every pull request needs its list of reviews, `[]` for none; events that leave a pull request in another state than it is stop the run; a pull request without events gets a note |
| A timestamp, a state or a time zone is read as something else | One strict timestamp pattern, the five known review states, and time zone names checked with Intl and `Intl.supportedValuesOf('timeZone')`; an offset in place of a name is refused; there is no fallback |
| A skipped or repeated local time is read two ways | One written rule (docs/method.md), with a note in the report for every shift it touches; tests cover both nights |
| The report changes with the clock, the time zone or the locale of the machine | No clock is read and no Date object is made; every Intl call gets a zone, a moment and the locale `en-US`; a test compares the reports under four time zones and locales; `test/repo.test.js` looks for clock reads in `src` |
| A run passes with nothing measured | A run in which every pull request is left out gives no verdict, exit code `2` |
| The memory or the time is exhausted | Each file has a size limit checked on the open file before it is read; pull requests, reviews, events, people and patterns are capped; offsets are read once a day and kept, and working hours are cut by binary search. Tests check the time, with limits that widen under coverage only |
| A pattern from the input is slow | No regular expression is built from the input; bot patterns are matched by a loop whose work is at most the product of the two lengths; a test looks for `new RegExp` in src |
| Text from the input rewrites the terminal or breaks a Markdown table | Logins and team names with control characters are refused in the team file; every text goes through `safeText`, and Markdown cells escape the characters a table, a link or HTML needs. Tests put ANSI escapes and direction controls in logins |
| A cell is run as a formula | A Markdown cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe |
| `__proto__` changes how objects behave | The JSON reader defines own properties; people are kept in maps. A test uses `__proto__`, `constructor` and `toString` as keys and logins |
| A device or a link to one named as an input hangs the tool | The file is opened once, and its type and size are taken from the open handle: a device or a pipe is refused as not a regular file |
| Personal data leaks through a report | Only logins, account types, states and times are read; titles, bodies, names and email addresses are skipped unread; a login outside the team is never shown (docs/secure-defaults.md) |
| A token leaks | The tool reads no token and no environment variable, and calls no API; `test/repo.test.js` looks for `process.env` and API addresses in src |
| A report overwrites an input, or the tool leaves files behind | Only `--out` writes, and an input is refused as its path; there is no cache or temporary file. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the exported data is complete or true, how it was exported and with which token, the time zone data of the Node that runs the tool (docs/limits.md), who may change the team file and the configuration in your repository, where your pipeline keeps the reports, and the law that applies to the personal data in them.
