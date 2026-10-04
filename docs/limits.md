# Limits

The tool measures the data it is given, with the working hours of the team file and the time zone data of the Node that runs it. It is as good as those three.

## What it cannot see

- **Reviews that happen elsewhere.** A review in a call, in a message or in a comment that is not a review of the pull request is not in the data. A comment on the pull request that is not a review (an issue comment) is not read either.
- **Who was asked.** The wait for a first review ends with the first review of anyone of the team, not of the person who was asked. The list of requested reviewers that GitHub returns is the list of now, not of the moment the pull request was opened, so the tool does not read it.
- **Incomplete exports.** GitHub returns lists in pages. A list of reviews or events that misses a page gives wrong numbers. The tool refuses some of what a missing page causes (a pull request with no list of reviews, events that leave the pull request in another state than it is), not all of it.
- **Pull requests without events.** Without its issue events, a pull request is taken as ready from `created_at`. One that began as a draft is then counted from the moment it was opened, and its wait is too long. The report names these pull requests in a note.
- **Absences that are not in the file.** A sick day or a public holiday that nobody wrote down is not seen; the working wait then counts hours in which the person was away. The team file has days off but no calendar of public holidays.
- **The working hours of people outside the team.** A login that is not in the team file has no working hours. By default the run stops; with `"unknownLogins": "exclude"` its pull requests and reviews are left out, which can make the first review of a pull request a later one.
- **Who merged.** The list of pull requests does not say who merged a pull request, so the merge wait counts the working hours of the author.
- **The time zone data of another machine.** The offsets come from the Intl API of the Node that runs the tool. The IANA page says of the database: "It is updated periodically to reflect changes made by political bodies to time zone boundaries, UTC offsets, and daylight-saving rules." A Node with older data gives other numbers for a zone whose rules changed after its data was made. Pin the Node version of the pipeline that runs the tool.
- **Two clock changes within a day.** Offsets are read once a day and every change between two readings is found to the second; two changes within one day that undo each other are not seen.
- **Minutes.** Every number is a whole number of minutes, rounded down, and every label is to the minute. Waits are counted to the millisecond before they are rounded.
- **Statistics of small groups.** A pair of zones with one or two pull requests has a median and a percentile, but they say little. The count is always shown next to them.

## Size limits

Past a limit, the input is refused with exit code `2` and no verdict; nothing is half read.

| What | Limit |
| --- | --- |
| pull request file | 64 MB, nesting 32 deep, 20,000,000 values, 1,048,576 characters in a string |
| team file, configuration | 1 MB each, nesting 32 deep, 100,000 values, 4,096 characters in a string |
| pull requests | 10,000 |
| reviews | 1,000 for each pull request |
| issue events | 3,000 for each pull request |
| people | 200, with 6 shifts on a day of the week and 1,000 days off each |
| bots | 100 patterns of at most 60 characters |
| limit | 1 to 100,000 minutes |
| problems listed | 20, then a count of the rest |

The tests measure five thousand pull requests with three reviews each, fifty people in ten zones, over six hundred days, with a time limit, and refuse JSON nested half a million deep in one pass.
