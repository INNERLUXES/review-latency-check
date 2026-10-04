import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodeText, displayPath, fileError, flat, grouped, isBinary, lineStarts, listText, plural, positionOf, readBounded, readTextFile, safeText, writeReport } from '../src/index.js';
import { withFiles } from './helpers.js';

// The small helpers: numbers and lists, text cleaning, lines and columns, and the files the tool reads and writes.

test('size: grouped numbers, lists and plurals', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(listText([]), '');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(plural(1, 'day'), '1 day');
  assert.equal(plural(2, 'day'), '2 days');
  assert.equal(plural(2, 'domain alias', 'domain aliases'), '2 domain aliases');
});

test('text: control, line separator and direction characters become spaces; long text is cut; white space runs are one space', () => {
  assert.equal(safeText(`a${String.fromCharCode(27)}b${String.fromCharCode(0x202e)}c${String.fromCharCode(0x2028)}d${String.fromCharCode(0x9b)}e`), 'a b c d e');
  assert.equal(safeText('x'.repeat(20), 10), 'xxxxxxx...');
  assert.equal(flat(' a \n\t b '), 'a b');
});

test('lines: LF, CRLF and a lone CR each end a line; positions count from 1', () => {
  const starts = lineStarts('a\nb\r\nc\rd');
  assert.deepEqual(starts, [0, 2, 5, 7]);
  assert.deepEqual(positionOf(starts, 6), { line: 3, column: 2 });
});

test('files: a path relative to the base with forward slashes, and an error that names the file', async () => {
  const base = resolve('base');
  assert.equal(displayPath(resolve(base, 'a/b.csv'), base), 'a/b.csv');
  assert.equal(displayPath(base, base), '.');
  assert.ok(displayPath(resolve(base, '../x.csv'), base).endsWith('/x.csv'));
  assert.equal(fileError('a.csv', 'why').message, 'a.csv: why');
  assert.equal(fileError('a.csv', 'why').reason, 'why');
  await withFiles({ 'a.txt': 'hello' }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a.txt'), 10)).toString(), 'hello');
    await assert.rejects(readBounded(resolve(dir, 'a.txt'), 2), /5 bytes is over the 2 byte limit/);
    await assert.rejects(readBounded(resolve(dir, 'a.txt'), 2), /a\.txt/);
    await assert.rejects(readBounded(resolve(dir, 'none.txt'), 2), /no such file/);
    await assert.rejects(readBounded(dir, 2), /not a regular file|cannot be read/);
  });
});

test('files: a text file is read as UTF-8 without its byte order mark; UTF-16 and binary files are refused', async () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  assert.equal(decodeText(Buffer.concat([bom, Buffer.from('a,b')])), 'a,b');
  assert.equal(isBinary(Buffer.from([65, 0, 66])), true);
  assert.equal(isBinary(Buffer.from('plain')), false);
  await withFiles({ 'u8.csv': Buffer.concat([bom, Buffer.from('x\n')]), 'u16.csv': Buffer.from([0xff, 0xfe, 0x61, 0]), 'bin.csv': Buffer.from([0x61, 0, 0x62]) }, async (dir) => {
    const r = await readTextFile('u8.csv', dir, 100);
    assert.deepEqual({ file: r.file, size: r.size, text: r.text }, { file: 'u8.csv', size: 5, text: 'x\n' });
    await assert.rejects(readTextFile('u16.csv', dir, 100), /u16\.csv: is UTF-16; only UTF-8 is read/);
    await assert.rejects(readTextFile('bin.csv', dir, 100), /bin\.csv: holds binary data/);
    await assert.rejects(readTextFile('u8.csv', dir, 2), /u8\.csv: 5 bytes is over the 2 byte limit/);
  });
});

test('files: writeReport writes the report where --out says, and refuses a path that is one of the inputs', async () => {
  await withFiles({ 'in.csv': 'a\n' }, async (dir) => {
    assert.equal(await writeReport('out/../report.txt', 'hello\n', dir, ['in.csv']), 'report.txt');
    assert.equal(await readFile(resolve(dir, 'report.txt'), 'utf8'), 'hello\n');
    await writeReport('report.txt', 'again\n', dir, []);
    assert.equal(await readFile(resolve(dir, 'report.txt'), 'utf8'), 'again\n', 'a report file is replaced');
    await assert.rejects(writeReport('./in.csv', 'x', dir, ['in.csv']), /in\.csv: is one of the inputs/);
    assert.equal(await readFile(resolve(dir, 'in.csv'), 'utf8'), 'a\n', 'the input is untouched');
    await assert.rejects(writeReport('missing-folder/r.txt', 'x', dir, []), /cannot be written/);
    await assert.rejects(writeReport('.', 'x', dir, []), /cannot be written/);
  });
});
