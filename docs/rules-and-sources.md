# Rules and sources

Every sentence the tool quotes, in a report or in these documents, comes from a page that was opened and saved as plain text in `research/sources`, with its address on the first line. `src/data.js` holds the sentences, and `test/data.test.js` compares each one with the saved text, so a sentence cannot drift from its page. The same test checks that every field the tool reads from a GitHub object is on the saved page of its endpoint. Where the tool makes a choice that no page makes for it, docs/method.md says so.

## The saved pages

| File | Page | What is kept |
| --- | --- | --- |
| `github-rest-pulls-list.txt` | GitHub Docs: REST API endpoints for pull requests, https://docs.github.com/en/rest/pulls/pulls | the start of the page, the endpoint "List pull requests" with its `state`, `per_page` and `page` parameters, and the lines of its response schema for the fields the tool reads |
| `github-rest-pull-reviews.txt` | GitHub Docs: REST API endpoints for pull request reviews, https://docs.github.com/en/rest/pulls/reviews | the endpoint "List reviews for a pull request" with its response schema and the state of its example, the sentence on PENDING reviews and the `event` parameter of "Create a review", the endpoint that dismisses a review, and the other states of the examples on the page |
| `github-rest-issue-events.txt` | GitHub Docs: REST API endpoints for issue events, https://docs.github.com/en/rest/issues/events | the start of the page and the endpoint "List issue events" of one issue |
| `github-issue-event-types.txt` | GitHub Docs: Issue event types, https://docs.github.com/en/rest/using-the-rest-api/issue-event-types | the start of the page, the common properties `id`, `event` and `created_at`, and the events `closed`, `convert_to_draft`, `merged`, `ready_for_review`, `reopened` and `reviewed` |
| `github-rest-timezones.txt` | GitHub Docs: Timezones and the REST API, https://docs.github.com/en/rest/using-the-rest-api/timezones-and-the-rest-api | the first paragraphs with the sentence on the timestamps the API returns, the order of the rules for a request, and the default to UTC |
| `ecma402-time-zones.txt` | ECMAScript Internationalization API Specification (ECMA-402), the draft at https://tc39.es/ecma402/ | section 6.5 on the use of the IANA Time Zone Database, 6.5.1 to 6.5.3 on the available and primary time zone names, the time zone branch of 8.3.2 `Intl.supportedValuesOf`, the time zone steps of 11.1.2 CreateDateTimeFormat, and 11.3.6 `formatToParts` |
| `iana-time-zones.txt` | IANA: Time Zones, https://www.iana.org/time-zones | the two paragraphs that describe the Time Zone Database |
| `iana-tz-theory.txt` | IANA: Theory and pragmatics of the tz code and data, https://www.iana.org/time-zones/theory | the end of the scope section on base offsets, and the parts of the section on timezone identifiers about names, their format, case, zones and links, and Etc/UTC |
| `rfc3339-date-time.txt` | RFC 3339, Date and Time on the Internet: Timestamps, https://www.rfc-editor.org/rfc/rfc3339.txt | section 4.1 on UTC and the grammar of section 5.6 |
| `rfc8259-json-objects.txt` | RFC 8259, The JSON Data Interchange Format, https://www.rfc-editor.org/rfc/rfc8259 | section 4, objects and repeated names |

Each page is kept in parts: a line `[...]` marks text left out. Left out are the parts that hold a year or a date (the version header of the GitHub pages, the timestamps of their example responses, the example timestamp of the time zone page, the title line of the ECMA-402 draft, the latest release on the IANA page), the parts that hold characters outside ASCII, the icons of the GitHub tables (written as "supported" and "not supported"), the table rows the tool does not rest on, and the parts the tool does not rest on. The GitHub pages are kept from the Markdown that docs.github.com serves for each page, with the Markdown marks of lists and code taken out; the states of the review examples come from the example responses of the page. Typographic quotes and apostrophes are written as ASCII. Every line of the saved text was compared with the page it came from.

## The measures and the check

| Id | What | Sentences | Method |
| --- | --- | --- | --- |
| `first-review` | the wait for the first review by a person of the team who is not the author | `ghReadyForReview`, `ghReviewsList` | [first-review](method.md#first-review) |
| `first-approval` | the wait for the first approval | `ghReviewsList`, `ghDismiss` | [first-approval](method.md#first-approval) |
| `merge` | the wait for the merge | `ghMerged`, `ghTimestampsUtc` | [merge](method.md#merge) |
| `first-review-limit` | the check of the first review against the limit of the configuration | `rfcUtc`, `tzUpdated` | [first-review-limit](method.md#first-review-limit) |

`--explain` prints these sentences at the end of the report, with the section and the page.

## The sentences

| Key | Used by | Page and section | Sentence |
| --- | --- | --- | --- |
| `ghPullsList` | the reader of pull requests | github-rest-pulls-list.txt, List pull requests | Lists pull requests in a specified repository. |
| `ghPullIsIssue` | the reader of issue events | github-rest-pulls-list.txt, About pull requests | Pull requests are a type of issue. |
| `ghReviewsList` | `first-review`, `first-approval` | github-rest-pull-reviews.txt, List reviews for a pull request | Lists all reviews for a specified pull request. The list of reviews returns in chronological order. |
| `ghPendingReview` | the reader of reviews | github-rest-pull-reviews.txt, Create a review for a pull request | Pull request reviews created in the PENDING state are not submitted and therefore do not include the submitted_at property in the response. |
| `ghDismiss` | `first-approval` | github-rest-pull-reviews.txt, Dismiss a review for a pull request | Dismisses a specified review on a pull request. |
| `ghEventsList` | the reader of issue events | github-rest-issue-events.txt, List issue events | Lists all events for an issue. |
| `ghEventCreatedAt` | the reader of issue events | github-issue-event-types.txt, Issue event object common properties | The timestamp indicating when the event occurred. |
| `ghReadyForReview` | `first-review` | github-issue-event-types.txt, ready_for_review | A draft pull request was marked as ready for review. |
| `ghConvertToDraft` | the spans of a pull request | github-issue-event-types.txt, convert_to_draft | The pull request was converted to draft mode. |
| `ghClosed` | the spans of a pull request | github-issue-event-types.txt, closed | The issue or pull request was closed. |
| `ghReopened` | the spans of a pull request | github-issue-event-types.txt, reopened | The issue or pull request was reopened. |
| `ghMerged` | `merge` | github-issue-event-types.txt, merged | The pull request was merged. |
| `ghReviewedState` | the reader of reviews | github-issue-event-types.txt, reviewed | The state of the submitted review. Can be one of: commented, changes_requested, approved or dismissed. |
| `ghTimestampsUtc` | `merge`, the reader of timestamps | github-rest-timezones.txt, Timezones and the REST API | Timestamps returned by the API are in UTC time, ISO 8601 format. |
| `tzUpdated` | `first-review-limit` | iana-time-zones.txt, Time Zones | It is updated periodically to reflect changes made by political bodies to time zone boundaries, UTC offsets, and daylight-saving rules. |
| `tzNameFormat` | the documents | iana-tz-theory.txt, Timezone identifiers | Names normally have the format AREA/LOCATION, where AREA is a continent or ocean, and LOCATION is a specific location within the area. |
| `ecmaRangeError` | the check of time zone names | ecma402-time-zones.txt, 11.1.2 CreateDateTimeFormat | If timeZoneIdentifierRecord is empty, throw a RangeError exception. |
| `ecmaSystemZone` | the decision to read no clock | ecma402-time-zones.txt, 11.1.2 CreateDateTimeFormat | If timeZone is undefined, then Set timeZone to SystemTimeZoneIdentifier(). |
| `ecmaNowWhenUndefined` | the decision to read no clock | ecma402-time-zones.txt, 11.3.6 Intl.DateTimeFormat.prototype.formatToParts ( date ) | If date is undefined, then Let x be ! Call(%Date.now%, undefined). |
| `ecmaPrimaryList` | the check of time zone names | ecma402-time-zones.txt, 8.3.2 Intl.supportedValuesOf ( key ) | Let list be AvailablePrimaryTimeZoneIdentifiers( ). |
| `rfcUtc` | `first-review-limit` | rfc3339-date-time.txt, 4.1. Coordinated Universal Time (UTC) | Because the daylight saving rules for local time zones are so convoluted and can change based on local law at unpredictable times, true interoperability is best achieved by using Coordinated Universal Time (UTC). |
| `rfcTimeOffset` | the reader of timestamps | rfc3339-date-time.txt, 5.6. Internet Date/Time Format | time-offset = "Z" / time-numoffset |
| `jsonUnpredictable` | the JSON reader | rfc8259-json-objects.txt, 4. Objects | When the names within an object are not unique, the behavior of software that receives such an object is unpredictable. |

## What the sentences do and do not say

- The GitHub pages say which fields a pull request, a review and an issue event have, that the reviews come in chronological order, that a PENDING review has no `submitted_at`, which events mark a pull request ready or a draft, and that the timestamps are in UTC. They do not say when a review is "waiting"; the spans of docs/method.md, and the choice of which reviews end the wait, are the tool's own.
- The GitHub pages do not list the review states of the REST API in one place. The upper-case states come from the example responses of the review page and the `PENDING` state from its text; the lower-case list from the `reviewed` event of the timeline. The tool reads both cases and refuses any other state.
- ECMA-402 says how Intl resolves a time zone name and that an unknown name throws a RangeError. It does not say how a local time that is skipped or repeated must be read; the rule of docs/method.md is the tool's own.
- The IANA pages say that offsets and rules change. The working hours of the report hold for the time zone data of the Node that runs the tool.
- No page defines the percentile of a report. The nearest-rank method of docs/method.md is the tool's own choice, made so that every number is a wait that happened.
