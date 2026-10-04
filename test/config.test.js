import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_DEFAULTS, CONFIG_KEYS, ConfigError, MEASURES, POLICIES, readConfig } from '../src/index.js';
import { CONFIG, configWith, json, lineOf } from './helpers.js';

const read = (object) => readConfig(json(object), 'config.json');
const problems = (object) => {
  try {
    read(object);
  } catch (error) {
    assert.ok(error instanceof ConfigError, error.message);
    return error.problems.map((p) => p.text);
  }
  assert.fail('the configuration was accepted');
  return [];
};
const refused = (object, pattern) => assert.ok(problems(object).some((p) => pattern.test(p)), problems(object).join('\n'));

test('config: the limit is read, and the other keys have defaults that are no limit', () => {
  assert.deepEqual(read(CONFIG), { limit: { measure: 'working', minutes: 120 }, percentile: 90, bots: [], unknownLogins: 'fail' });
  assert.deepEqual(read(configWith({ firstReviewLimit: { measure: 'wall', minutes: 1440 }, percentile: 95, bots: ['*[bot]', 'release-helper'], unknownLogins: 'exclude' })), { limit: { measure: 'wall', minutes: 1440 }, percentile: 95, bots: ['*[bot]', 'release-helper'], unknownLogins: 'exclude' });
  assert.deepEqual(CONFIG_DEFAULTS, { percentile: 90, bots: [], unknownLogins: 'fail' });
  assert.deepEqual(MEASURES, ['working', 'wall']);
  assert.deepEqual(POLICIES, ['fail', 'exclude']);
  assert.deepEqual(Object.keys(CONFIG_KEYS), ['firstReviewLimit', 'percentile', 'bots', 'unknownLogins']);
});

test('config: there is no built-in limit; firstReviewLimit with both keys is needed', () => {
  refused({}, /firstReviewLimit: is needed: \{ "measure": "working" or "wall", "minutes": N \}; the tool has no limit of its own/);
  refused({ percentile: 90 }, /firstReviewLimit: is needed/);
  refused({ firstReviewLimit: { measure: 'working' } }, /firstReviewLimit\.minutes: is needed/);
  refused({ firstReviewLimit: { minutes: 60 } }, /firstReviewLimit\.measure: is needed: working or wall/);
  refused({ firstReviewLimit: 60 }, /must be an object such as \{ "measure": "working", "minutes": 480 \}, not a number/);
});

test('config: the minutes of the limit, with near misses on each side', () => {
  assert.equal(read(configWith({ firstReviewLimit: { measure: 'working', minutes: 1 } })).limit.minutes, 1);
  assert.equal(read(configWith({ firstReviewLimit: { measure: 'working', minutes: 100000 } })).limit.minutes, 100000);
  for (const bad of [0, 100001, 1.5, -5, '60']) refused(configWith({ firstReviewLimit: { measure: 'working', minutes: bad } }), /is not a whole number of minutes from 1 to 100,000/);
  refused(configWith({ firstReviewLimit: { measure: 'business', minutes: 60 } }), /business is not a measure: write working .* or wall/);
  refused(configWith({ firstReviewLimit: { measure: 'working', minutes: 60, hours: 1 } }), /firstReviewLimit\.hours: unknown key/);
});

test('config: the percentile is a whole number from 50 to 100', () => {
  for (const p of [50, 75, 99, 100]) assert.equal(read(configWith({ percentile: p })).percentile, p);
  for (const bad of [49, 101, 90.5, '90', null]) refused(configWith({ percentile: bad }), /is not a whole number from 50 to 100/);
});

test('config: bots are logins or patterns, each once, and never a pattern that matches everyone', () => {
  refused(configWith({ bots: '*[bot]' }), /must be a list of logins or patterns/);
  refused(configWith({ bots: ['*'] }), /matches every login; the run would measure nothing/);
  refused(configWith({ bots: ['**'] }), /matches every login/);
  refused(configWith({ bots: ['a b'] }), /is not a login or a pattern/);
  refused(configWith({ bots: ['ci-bot', 'CI-BOT'] }), /CI-BOT is named twice/);
  refused(configWith({ bots: Array.from({ length: 101 }, (_, i) => `bot${i}`) }), /holds more than 100 patterns/);
  assert.deepEqual(read(configWith({ bots: [] })).bots, []);
});

test('config: unknownLogins is fail or exclude', () => {
  refused(configWith({ unknownLogins: 'ignore' }), /ignore is not a policy: write fail .* or exclude/);
});

test('config: an unknown key is an error with a suggestion and its line; a key named twice is refused', () => {
  const text = json({ ...CONFIG, precentile: 90 });
  try {
    readConfig(text, 'config.json');
    assert.fail('accepted');
  } catch (error) {
    assert.match(error.problems[0].text, new RegExp(`^config\\.json:${lineOf(text, '"precentile"')}: precentile: unknown key; did you mean percentile\\?`));
  }
  refused({ ...CONFIG, colour: 'red' }, /colour: unknown key; the keys here are firstReviewLimit, percentile, bots, unknownLogins/);
  assert.throws(() => readConfig('{"percentile": 90, "percentile": 95}', 'config.json'), /the name "percentile" appears twice in one object/);
  refused([], /the configuration must be one JSON object, not an array/);
  assert.throws(() => readConfig('{"percentile": 90,}', 'config.json'), /config\.json: line 1, column 19: a comma before the closing brace/);
});
