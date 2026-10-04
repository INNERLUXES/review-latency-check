// Lists of moments in time: [start, end) pairs in milliseconds of UTC, kept sorted with no two pairs that touch or
// overlap. Every list a function returns has that normal form.

// The normal form of a list of pairs: empty pairs left out, sorted, touching and overlapping pairs joined.
export function normalize(list) {
  const sorted = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export const union = (...lists) => normalize(lists.flat().map(([a, b]) => [a, b]));

// The moments in both lists, in one pass over each.
export function intersect(x, y) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const a = Math.max(x[i][0], y[j][0]);
    const b = Math.min(x[i][1], y[j][1]);
    if (b > a) out.push([a, b]);
    if (x[i][1] < y[j][1]) i += 1;
    else j += 1;
  }
  return out;
}

// The part of a list between two moments, found by binary search, so a long list of working hours costs the log of its
// length to cut. An end of Infinity is allowed.
export function clip(list, from, to) {
  if (!(to > from)) return [];
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][1] <= from) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = lo; i < list.length && list[i][0] < to; i += 1) {
    const a = Math.max(list[i][0], from);
    const b = Math.min(list[i][1], to);
    if (b > a) out.push([a, b]);
  }
  return out;
}

// The length of a list in milliseconds.
export const total = (list) => list.reduce((sum, [a, b]) => sum + (b - a), 0);

// The length of a list in whole minutes, rounded down.
export const minutesOf = (list) => Math.floor(total(list) / 60000);
