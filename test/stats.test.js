import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestRank, percentile, summarize } from '../src/index.js';

// The nearest-rank method: the p-th percentile of n sorted values is the value at rank ceil(p * n / 100), from 1.

test('nearestRank: ceil(p * n / 100), and 1 at least', () => {
  assert.equal(nearestRank(50, 1), 1);
  assert.equal(nearestRank(50, 2), 1);
  assert.equal(nearestRank(50, 3), 2);
  assert.equal(nearestRank(50, 4), 2);
  assert.equal(nearestRank(90, 10), 9);
  assert.equal(nearestRank(90, 11), 10);
  assert.equal(nearestRank(90, 9), 9);
  assert.equal(nearestRank(95, 20), 19);
  assert.equal(nearestRank(95, 21), 20);
  assert.equal(nearestRank(100, 7), 7);
  for (let n = 1; n <= 300; n += 1) for (const p of [50, 75, 90, 95, 99, 100]) assert.equal(nearestRank(p, n), Math.max(1, Math.ceil((p * n) / 100)), `${p} ${n}`);
});

test('percentile: always one of the values, never a value between two; the median of an even count is the lower middle', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([7], 90), 7);
  assert.equal(percentile([40, 10, 30, 20], 50), 20, 'the lower of the two middle values, not their average of 25');
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1000], 90), 10, 'one long wait does not move the 90th percentile of eleven');
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 1000], 95), 1000, 'but it is the 95th percentile of ten');
  const input = [3, 1, 2];
  percentile(input, 50);
  assert.deepEqual(input, [3, 1, 2], 'the input is not sorted in place');
});

test('summarize: count, median, upper percentile and max, with no average', () => {
  assert.deepEqual(summarize([], 90), { count: 0, median: null, upper: null, max: null });
  assert.deepEqual(summarize([5, 1, 3], 90), { count: 3, median: 3, upper: 5, max: 5 });
  assert.deepEqual(summarize([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90), { count: 10, median: 50, upper: 90, max: 100 });
  assert.equal(Object.hasOwn(summarize([1], 90), 'mean'), false);
});
