import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clip, intersect, minutesOf, normalize, total, union } from '../src/index.js';

test('normalize: empty pairs out, sorted, touching and overlapping pairs joined', () => {
  assert.deepEqual(normalize([[5, 9], [1, 3], [3, 4], [8, 12], [20, 20], [30, 25]]), [[1, 4], [5, 12]]);
  assert.deepEqual(normalize([]), []);
  const input = [[1, 2]];
  normalize(input)[0][1] = 99;
  assert.deepEqual(input, [[1, 2]], 'the input is not changed');
});

test('union and intersect: the moments of either list, and of both', () => {
  assert.deepEqual(union([[1, 3]], [[2, 6]], [[8, 9]]), [[1, 6], [8, 9]]);
  assert.deepEqual(intersect([[0, 10], [20, 30]], [[5, 25]]), [[5, 10], [20, 25]]);
  assert.deepEqual(intersect([[0, 10]], [[10, 20]]), [], 'touching pairs share nothing');
  assert.deepEqual(intersect([], [[0, 1]]), []);
  assert.deepEqual(intersect([[0, 100]], [[10, 20], [30, 40], [50, 60]]), [[10, 20], [30, 40], [50, 60]]);
});

test('clip, total and minutesOf: a list cut to a window, its length, and its whole minutes', () => {
  assert.deepEqual(clip([[0, 10], [20, 30]], 5, 25), [[5, 10], [20, 25]]);
  assert.deepEqual(clip([[0, 10]], 10, 5), []);
  assert.deepEqual(clip([[0, 10], [20, Infinity]], 5, 40), [[5, 10], [20, 40]], 'an open end is cut at the window');
  assert.deepEqual(clip([[0, 10], [20, 30]], 0, Infinity), [[0, 10], [20, 30]]);
  const long = Array.from({ length: 1000 }, (_, k) => [k * 10, k * 10 + 5]);
  assert.deepEqual(clip(long, 4992, 5013), [[4992, 4995], [5000, 5005], [5010, 5013]], 'binary search finds the first pair that reaches the window');
  assert.deepEqual(clip(long, 99999, 100000), []);
  assert.equal(total([[0, 10], [20, 25]]), 15);
  assert.equal(minutesOf([[0, 90 * 60000 + 59999]]), 90);
  assert.equal(minutesOf([]), 0);
});
