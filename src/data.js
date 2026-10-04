// The pages and sentences the tool and its documents rest on. Each sentence comes from a page that is saved, with its
// address on the first line, in research/sources, and test/data.test.js compares this file with the saved text. Change a
// sentence here only after saving the new page text and updating docs/rules-and-sources.md. The code in src/ uses these
// constants and never writes a quoted sentence of its own.

export const SOURCES = [
  { id: 'gh-pulls', file: 'github-rest-pulls-list.txt', url: 'https://docs.github.com/en/rest/pulls/pulls', label: 'GitHub Docs: REST API endpoints for pull requests, List pull requests' },
  { id: 'gh-reviews', file: 'github-rest-pull-reviews.txt', url: 'https://docs.github.com/en/rest/pulls/reviews', label: 'GitHub Docs: REST API endpoints for pull request reviews, List reviews for a pull request' },
  { id: 'gh-events', file: 'github-rest-issue-events.txt', url: 'https://docs.github.com/en/rest/issues/events', label: 'GitHub Docs: REST API endpoints for issue events, List issue events' },
  { id: 'gh-event-types', file: 'github-issue-event-types.txt', url: 'https://docs.github.com/en/rest/using-the-rest-api/issue-event-types', label: 'GitHub Docs: Issue event types' },
  { id: 'gh-timezones', file: 'github-rest-timezones.txt', url: 'https://docs.github.com/en/rest/using-the-rest-api/timezones-and-the-rest-api', label: 'GitHub Docs: Timezones and the REST API' },
  { id: 'ecma402', file: 'ecma402-time-zones.txt', url: 'https://tc39.es/ecma402/', label: 'ECMAScript Internationalization API Specification (ECMA-402): the IANA Time Zone Database, Intl.supportedValuesOf, CreateDateTimeFormat and formatToParts' },
  { id: 'iana-tz', file: 'iana-time-zones.txt', url: 'https://www.iana.org/time-zones', label: 'IANA: Time Zones, the page of the Time Zone Database' },
  { id: 'iana-theory', file: 'iana-tz-theory.txt', url: 'https://www.iana.org/time-zones/theory', label: 'IANA: Theory and pragmatics of the tz code and data' },
  { id: 'rfc3339', file: 'rfc3339-date-time.txt', url: 'https://www.rfc-editor.org/rfc/rfc3339.txt', label: 'RFC 3339, Date and Time on the Internet: Timestamps' },
  { id: 'rfc8259', file: 'rfc8259-json-objects.txt', url: 'https://www.rfc-editor.org/rfc/rfc8259', label: 'RFC 8259, The JSON Data Interchange Format' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// Sentences quoted in the reports and the documents. Every text is on its saved page word for word (test/data.test.js
// compares them, with runs of white space read as one space), and holds no year.
export const FACTS = {
  ghPullsList: { source: 'gh-pulls', section: 'List pull requests', text: 'Lists pull requests in a specified repository.' },
  ghPullIsIssue: { source: 'gh-pulls', section: 'About pull requests', text: 'Pull requests are a type of issue.' },
  ghReviewsList: { source: 'gh-reviews', section: 'List reviews for a pull request', text: 'Lists all reviews for a specified pull request. The list of reviews returns in chronological order.' },
  ghPendingReview: { source: 'gh-reviews', section: 'Create a review for a pull request', text: 'Pull request reviews created in the PENDING state are not submitted and therefore do not include the submitted_at property in the response.' },
  ghDismiss: { source: 'gh-reviews', section: 'Dismiss a review for a pull request', text: 'Dismisses a specified review on a pull request.' },
  ghEventsList: { source: 'gh-events', section: 'List issue events', text: 'Lists all events for an issue.' },
  ghEventCreatedAt: { source: 'gh-event-types', section: 'Issue event object common properties', text: 'The timestamp indicating when the event occurred.' },
  ghReadyForReview: { source: 'gh-event-types', section: 'ready_for_review', text: 'A draft pull request was marked as ready for review.' },
  ghConvertToDraft: { source: 'gh-event-types', section: 'convert_to_draft', text: 'The pull request was converted to draft mode.' },
  ghClosed: { source: 'gh-event-types', section: 'closed', text: 'The issue or pull request was closed.' },
  ghReopened: { source: 'gh-event-types', section: 'reopened', text: 'The issue or pull request was reopened.' },
  ghMerged: { source: 'gh-event-types', section: 'merged', text: 'The pull request was merged.' },
  ghReviewedState: { source: 'gh-event-types', section: 'reviewed', text: 'The state of the submitted review. Can be one of: commented, changes_requested, approved or dismissed.' },
  ghTimestampsUtc: { source: 'gh-timezones', section: 'Timezones and the REST API', text: 'Timestamps returned by the API are in UTC time, ISO 8601 format.' },
  tzUpdated: { source: 'iana-tz', section: 'Time Zones', text: 'It is updated periodically to reflect changes made by political bodies to time zone boundaries, UTC offsets, and daylight-saving rules.' },
  tzNameFormat: { source: 'iana-theory', section: 'Timezone identifiers', text: 'Names normally have the format AREA/LOCATION, where AREA is a continent or ocean, and LOCATION is a specific location within the area.' },
  ecmaRangeError: { source: 'ecma402', section: '11.1.2 CreateDateTimeFormat', text: 'If timeZoneIdentifierRecord is empty, throw a RangeError exception.' },
  ecmaSystemZone: { source: 'ecma402', section: '11.1.2 CreateDateTimeFormat', text: 'If timeZone is undefined, then Set timeZone to SystemTimeZoneIdentifier().' },
  ecmaNowWhenUndefined: { source: 'ecma402', section: '11.3.6 Intl.DateTimeFormat.prototype.formatToParts ( date )', text: 'If date is undefined, then Let x be ! Call(%Date.now%, undefined).' },
  ecmaPrimaryList: { source: 'ecma402', section: '8.3.2 Intl.supportedValuesOf ( key )', text: 'Let list be AvailablePrimaryTimeZoneIdentifiers( ).' },
  rfcUtc: { source: 'rfc3339', section: '4.1. Coordinated Universal Time (UTC)', text: 'Because the daylight saving rules for local time zones are so convoluted and can change based on local law at unpredictable times, true interoperability is best achieved by using Coordinated Universal Time (UTC).' },
  rfcTimeOffset: { source: 'rfc3339', section: '5.6. Internet Date/Time Format', text: 'time-offset = "Z" / time-numoffset' },
  jsonUnpredictable: { source: 'rfc8259', section: '4. Objects', text: 'When the names within an object are not unique, the behavior of software that receives such an object is unpredictable.' }
};

// The page of a quoted sentence.
export const factPage = (key) => source(FACTS[key].source).url;

// The days of the week as the team file and the reports write them, from Sunday, in the order of
// Date.prototype.getUTCDay, and the months as the date labels write them.
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
