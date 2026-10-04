import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARGS, prepare } from '../tools/example.mjs';
import { DAY0 } from './helpers.js';

// The same files give the same report under every time zone and locale of the machine: the example runs in child
// processes with other TZ, LANG and LC_ALL, with each kind of label, and the reports are compared.

const ENVS = [
  { TZ: 'UTC', LANG: 'C', LC_ALL: 'C' },
  { TZ: 'Pacific/Kiritimati', LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' },
  { TZ: 'America/Adak', LANG: 'de_DE.UTF-8', LC_ALL: 'de_DE.UTF-8' },
  { TZ: 'Asia/Kathmandu', LANG: 'ar_EG.UTF-8', LC_ALL: 'ar_EG.UTF-8' }
];

test('the reports do not depend on the time zone or the locale of the machine', { timeout: 120000 }, async () => {
  const cli = fileURLToPath(new URL('../bin/review-latency-check.js', import.meta.url));
  const dir = await mkdtemp(resolve(tmpdir(), 'review-latency-check-locale-'));
  try {
    await prepare(dir);
    const base = ARGS.slice(0, ARGS.indexOf('--time-labels'));
    for (const extra of [['--time-labels', 'offset', '--explain'], ['--time-labels', 'date', '--format', 'json'], ['--time-labels', 'iso', '--format', 'markdown']]) {
      const outputs = new Set();
      for (const env of ENVS) {
        const r = spawnSync(process.execPath, [cli, ...base, ...extra], { env: { ...process.env, ...env }, encoding: 'utf8', cwd: dir });
        assert.equal(r.status, 1, r.stderr);
        outputs.add(r.stdout);
      }
      assert.equal(outputs.size, 1, `the same report under every time zone and locale: ${extra.join(' ')}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the small functions give the same answers under every time zone and locale', () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const script = `import(${JSON.stringify(new URL('../src/index.js', import.meta.url).href)}).then((m) => process.stdout.write(JSON.stringify([m.dayOfDate(m.dateOfDay(${DAY0})), m.weekdayName(${DAY0}), m.timeLabel(${DAY0} * m.DAY_MS + 3600000, 'date'), m.parseTimestamp(m.dateOfDay(${DAY0}) + 'T01:00:00Z'), m.offsetFromIntl('Asia/Kolkata', ${DAY0} * m.DAY_MS), m.grouped(1234567), m.loginKey('IIi'), m.checkZone('europe/berlin').ok])));`;
  const outputs = new Set();
  for (const env of ENVS) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, ...env }, encoding: 'utf8', cwd });
    assert.equal(r.status, 0, r.stderr);
    outputs.add(r.stdout);
  }
  assert.equal(outputs.size, 1);
  const [day, weekday, , moment, offset, number, key, zone] = JSON.parse([...outputs][0]);
  assert.deepEqual([day, weekday, moment, offset, number, key, zone], [DAY0, 'Mon', DAY0 * 86400000 + 3600000, 330 * 60000, '1,234,567', 'iii', true]);
});
