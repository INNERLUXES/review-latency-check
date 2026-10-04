import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOGIN_LIMITS, globMatch, isBot, isLogin, isPattern, loginKey } from '../src/index.js';

// The time limits widen under coverage, as everywhere in these tests.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const within = (start, ms) => {
  const limit = COVERAGE ? ms * 4 : ms;
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
};

test('loginKey: logins are compared without case, on ASCII letters only', () => {
  assert.equal(loginKey('Ana-Dev'), 'ana-dev');
  assert.equal(loginKey('ANA'), loginKey('ana'));
  assert.equal(loginKey('I'), 'i', 'no Turkish dotless i, whatever the locale');
  assert.equal(loginKey('deps-bot[bot]'), 'deps-bot[bot]');
});

test('isLogin: letters, digits and single hyphens, not at either end, at most 39 characters', () => {
  for (const ok of ['a', 'ana', 'ana-dev', 'a1-b2-c3', 'A'.repeat(39)]) assert.equal(isLogin(ok), true, ok);
  for (const bad of ['', '-ana', 'ana-', 'ana--dev', 'ana dev', 'ana@example.org', 'ana_dev', 'A'.repeat(40), 'deps-bot[bot]', 42, null]) assert.equal(isLogin(bad), false, String(bad));
});

test('isPattern: login characters, square brackets and *, at most the limit', () => {
  for (const ok of ['*[bot]', 'release-helper', 'ci-*', '*']) assert.equal(isPattern(ok), true, ok);
  for (const bad of ['a b', 'a?', '(bot)', 'x'.repeat(LOGIN_LIMITS.maxPattern + 1), 42]) assert.equal(isPattern(bad), false, String(bad));
});

test('globMatch: * matches any run of characters, also an empty one, without case', () => {
  const cases = [
    ['*[bot]', 'deps-bot[bot]', true],
    ['*[bot]', 'DEPS-BOT[BOT]', true],
    ['*[bot]', 'deps-bot', false],
    ['release-helper', 'Release-Helper', true],
    ['release-helper', 'release-helpers', false],
    ['ci-*', 'ci-', true],
    ['ci-*', 'ci-runner', true],
    ['ci-*', 'xci-runner', false],
    ['*-bot-*', 'a-bot-b', true],
    ['*-bot-*', 'a-bot', false],
    ['a*b*c', 'abc', true],
    ['a*b*c', 'aXXbYYc', true],
    ['a*b*c', 'aXXbYY', false],
    ['**', 'anything', true],
    ['', '', true],
    ['', 'a', false]
  ];
  for (const [p, s, expected] of cases) assert.equal(globMatch(p, s), expected, `${p} ${s}`);
});

test('globMatch: a pattern full of stars against a long login is quick', () => {
  const start = Date.now();
  assert.equal(globMatch(`${'*a'.repeat(30)}*b`, 'a'.repeat(5000)), false);
  within(start, 1000);
});

test('isBot: user.type Bot, or a login a pattern matches', () => {
  assert.equal(isBot('helper', 'Bot', []), true);
  assert.equal(isBot('deps-bot[bot]', 'User', ['*[bot]']), true);
  assert.equal(isBot('ana', 'User', ['*[bot]']), false);
  assert.equal(isBot('ana', null, []), false);
});
