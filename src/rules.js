// The three waits the report measures, the one check that decides the exit code, and the sentences each rests on. The
// limit of the check comes from the configuration only.

export const METRICS = [
  { id: 'first-review', title: 'from the moment the pull request was first ready for review to the first review submitted by a person of the team who is not its author', hoursOf: 'the reviewer', facts: ['ghReadyForReview', 'ghReviewsList'] },
  { id: 'first-approval', title: 'from the same moment to the first review in the state APPROVED; an approval that was dismissed later has the state DISMISSED and does not count', hoursOf: 'the approver', facts: ['ghReviewsList', 'ghDismiss'] },
  { id: 'merge', title: 'from the same moment to merged_at', hoursOf: 'the author', facts: ['ghMerged', 'ghTimestampsUtc'] }
];

export const CHECK = { id: 'first-review-limit', title: 'a pull request is past the limit when its first review came later than firstReviewLimit.minutes after it was first ready, counted on the measure of firstReviewLimit.measure; a pull request with no review is past the limit when it waited that long before it was closed, or before --as-of', facts: ['rfcUtc', 'tzUpdated'] };

export const metricById = (id) => METRICS.find((m) => m.id === id);
