# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "review-latency-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include small made-up files that show the problem, the command you ran, what you expected and what happened. Use made-up logins, never real pull request data, and never a real key, token or password, even a revoked one.

## Scope

In scope:

- an input that makes the tool open a network connection, call an API, read a token or an environment variable, run a program, load a module or evaluate any part of a file
- an input that makes the tool write a file other than the one `--out` names, or write the report over one of its inputs
- a field of the input other than a login, a time zone, a pull number or a time that reaches a report: a title, a body, a name or an email address
- a time zone name that the tool accepts although Intl does not know it, or although `Intl.supportedValuesOf('timeZone')` does not list its primary name, a UTC offset that the tool accepts as a time zone, or a fallback to UTC or to the zone of the machine
- a wait that is wrong for the spans and the offsets Intl gives, a local time that the clocks skip or repeat that is not read by the rule of docs/method.md, or a review that counts or does not count against that document
- a percentile that is not one of the waits, or not the one the nearest-rank method of docs/method.md picks
- an input that the tool fails to read and passes over without an error, such as a missing or broken timestamp, a missing list of reviews, an unknown review state, an unknown key in the team file or the configuration, a key named twice, or events that contradict the pull request
- a run that passes with nothing measured
- an input that makes the tool hang, take very long or use unbounded memory, such as a very large file, JSON nested very deep, or very many pull requests, reviews, events or people
- text from an input that breaks a Markdown table, makes a link, is read as a formula when a table is pasted into a spreadsheet, rewrites the terminal through control or direction characters, or is shown unescaped in a report
- a key or a login such as `__proto__` that changes how objects behave inside the tool
- a report that changes with the clock, the time zone or the locale of the machine
- a sentence in src/data.js that differs from the saved page in research/sources

Out of scope: whether the exported data is complete or true, the time zone data of the Node that runs the tool (docs/limits.md lists what the tool cannot see), how the pull request data was exported and with which token, who may change the team file in your repository, and where your pipeline keeps the reports.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
