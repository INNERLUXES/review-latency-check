import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimelineError, readPulls, readySpans } from '../src/index.js';
import { at, event, json, merged, ms, pull, pullsFile } from './helpers.js';

// The spans in which a pull was open and ready for review, built from the pull and its issue events.
const one = (p, events) => readPulls(json(pullsFile([p], {}, events === undefined ? undefined : { [p.number]: events })), 'pulls.json').pulls[0];
const spans = (p, events) => readySpans(one(p, events));

test('timeline: without events, a pull is ready from created_at until it is closed, or still open', () => {
  assert.deepEqual(spans(pull(1, 'ana', at(0, '09:00'))), { spans: [[ms(0, '09:00'), Infinity]], startedAsDraft: false });
  assert.deepEqual(spans(merged(1, 'ana', at(0, '09:00'), at(1, '10:00'))).spans, [[ms(0, '09:00'), ms(1, '10:00')]]);
});

test('timeline: without events, a pull that is a draft now was never ready', () => {
  assert.deepEqual(spans(pull(1, 'ana', at(0, '09:00'), { draft: true })), { spans: [], startedAsDraft: true });
});

test('timeline: a pull opened as a draft is ready from ready_for_review; the hours as a draft never count', () => {
  const r = spans(merged(1, 'ana', at(0, '09:00'), at(2, '10:00')), [event('ready_for_review', at(1, '13:00')), event('merged', at(2, '10:00')), event('closed', at(2, '10:00'))]);
  assert.deepEqual(r, { spans: [[ms(1, '13:00'), ms(2, '10:00')]], startedAsDraft: true });
});

test('timeline: converted back to draft and ready again: the time in between is left out', () => {
  const r = spans(pull(1, 'ana', at(0, '09:00')), [event('convert_to_draft', at(0, '10:00')), event('ready_for_review', at(1, '09:00')), event('convert_to_draft', at(1, '11:00')), event('ready_for_review', at(1, '12:00'))]);
  assert.deepEqual(r, { spans: [[ms(0, '09:00'), ms(0, '10:00')], [ms(1, '09:00'), ms(1, '11:00')], [ms(1, '12:00'), Infinity]], startedAsDraft: false });
});

test('timeline: closed and reopened: the time it was closed is left out, and the end is closed_at', () => {
  const r = spans(merged(1, 'ana', at(0, '09:00'), at(3, '10:00')), [event('closed', at(0, '18:00')), event('reopened', at(2, '09:00')), event('merged', at(3, '10:00')), event('closed', at(3, '10:00'))]);
  assert.deepEqual(r.spans, [[ms(0, '09:00'), ms(0, '18:00')], [ms(2, '09:00'), ms(3, '10:00')]]);
});

test('timeline: a draft that was closed and reopened is still not ready until ready_for_review', () => {
  const r = spans(pull(1, 'ana', at(0, '09:00')), [event('closed', at(0, '10:00')), event('reopened', at(0, '11:00')), event('ready_for_review', at(0, '12:00'))]);
  assert.deepEqual(r, { spans: [[ms(0, '12:00'), Infinity]], startedAsDraft: true });
});

test('timeline: an empty list of events means no event happened', () => {
  assert.deepEqual(spans(pull(1, 'ana', at(0, '09:00')), []).spans, [[ms(0, '09:00'), Infinity]]);
  assert.deepEqual(spans(pull(1, 'ana', at(0, '09:00'), { draft: true }), []).spans, []);
});

test('timeline: events that contradict the pull stop the run instead of a guess', () => {
  assert.throws(() => spans(pull(1, 'ana', at(0, '09:00'), { draft: true }), [event('ready_for_review', at(0, '10:00'))]), (e) => e instanceof TimelineError && /#1: the events leave the pull request ready for review, but its draft flag is true; give the whole list of its issue events/.test(e.message));
  assert.throws(() => spans(pull(1, 'ana', at(0, '09:00')), [event('convert_to_draft', at(0, '10:00'))]), /leave the pull request a draft, but its draft flag is false/);
  assert.throws(() => spans(pull(1, 'ana', at(0, '09:00')), [event('closed', at(0, '10:00'))]), /the events leave the pull request closed, but its state is open/);
});
