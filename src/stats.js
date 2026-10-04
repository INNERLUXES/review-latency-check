// The numbers of a group of waits: the count, the median, an upper percentile and the longest. There is no average,
// because one pull that waited a week would move it for everyone and hide where the time went.
//
// Percentiles use the nearest-rank method: the p-th percentile of n values sorted from short to long is the value at
// rank ceil(p * n / 100), counted from 1, and the first value when that rank is 0. Every number the report shows is
// therefore one of the waits that happened, never a value between two of them. The median is the 50th percentile by
// the same rule, which for an even count is the lower of the two middle values. docs/method.md gives examples.

// The rank (from 1) of the p-th percentile of n values, by the nearest-rank method, in whole numbers.
export function nearestRank(p, n) {
  return Math.max(1, Math.floor((p * n + 99) / 100));
}

// The p-th percentile of a list of numbers, by the nearest-rank method, or null for an empty list.
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[nearestRank(p, sorted.length) - 1];
}

// { count, median, upper, max } of a list of numbers, with upper the p-th percentile.
export function summarize(values, p) {
  if (!values.length) return { count: 0, median: null, upper: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, median: sorted[nearestRank(50, sorted.length) - 1], upper: sorted[nearestRank(p, sorted.length) - 1], max: sorted.at(-1) };
}
