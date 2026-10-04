// Reading the three files named on the command line (the pull requests, the team file and the configuration), and
// writing the one report that --out names. A file is opened once,
// and its type and size are taken from the open handle, so a file swapped for a pipe or a device after it was named is
// refused, and a file over its limit is refused before it is read. The tool writes nothing else to disk: no cache, no
// temporary file, no log.

import { open } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const FILE_LIMITS = { maxPullsBytes: 64 * 1024 * 1024, maxTeamBytes: 1024 * 1024, maxConfigBytes: 1024 * 1024 };

// An error with the path in its message and the reason alone in .reason, so a caller can show its own path.
export function fileError(path, reason) {
  return Object.assign(new Error(`${path}: ${reason}`), { reason });
}

function megabytes(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('en-US')} MB` : `${bytes.toLocaleString('en-US')} byte`;
}

// The whole file, or an error when it is not a regular file or is over the limit.
export async function readBounded(path, maxBytes) {
  let handle;
  try {
    handle = await open(resolve(path), 'r');
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(path, 'no such file');
    throw fileError(path, `cannot be read (${error.code ?? error.message})`);
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw fileError(path, 'not a regular file');
    if (opened.size > maxBytes) throw fileError(path, `${opened.size.toLocaleString('en-US')} bytes is over the ${megabytes(maxBytes)} limit`);
    const buffer = Buffer.alloc(opened.size);
    let read = 0;
    while (read < opened.size) {
      const { bytesRead } = await handle.read(buffer, read, opened.size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
}

function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

// A path as shown in a report: relative to the base folder with forward slashes; a path outside it is shown absolute,
// also with forward slashes.
export function displayPath(path, base) {
  const rel = relative(base, path);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return toPosix(path);
  return toPosix(rel);
}

// A file holds binary data when its first 8,000 bytes hold a null byte.
export const isBinary = (buffer) => buffer.subarray(0, 8000).includes(0);

const isUtf16 = (buffer) => buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff));

// UTF-8 text without a leading byte order mark.
export function decodeText(buffer) {
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// One file named on the command line, read as text: { file, full, size, text }. Throws an error whose .reason says why it
// cannot be read: missing, not a regular file, over the limit, UTF-16 or binary.
export async function readTextFile(path, base, maxBytes) {
  const full = resolve(base, path);
  const shown = displayPath(full, base);
  const buffer = await readBounded(full, maxBytes).catch((error) => {
    throw fileError(shown, error.reason ?? error.message);
  });
  if (isUtf16(buffer)) throw fileError(shown, 'is UTF-16; only UTF-8 is read');
  if (isBinary(buffer)) throw fileError(shown, 'holds binary data (a null byte)');
  return { file: shown, full, size: buffer.length, text: decodeText(buffer) };
}

// Writes the report to the file that --out names, and nowhere else. The file is created with permissions for its owner
// only where the system has them. A path that is one of the inputs is refused, so a report never overwrites the data it
// was made from.
export async function writeReport(path, text, base, inputs = []) {
  const full = resolve(base, path);
  const shown = displayPath(full, base);
  const same = (a, b) => (process.platform === 'win32' || process.platform === 'darwin' ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (inputs.some((i) => same(resolve(base, i), full))) throw fileError(shown, 'is one of the inputs; give --out another file');
  let handle;
  try {
    handle = await open(full, 'w', 0o600);
  } catch (error) {
    throw fileError(shown, `cannot be written (${error.code ?? error.message})`);
  }
  try {
    await handle.writeFile(text, 'utf8');
  } finally {
    await handle.close();
  }
  return shown;
}
