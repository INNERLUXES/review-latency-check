// What the strict readers of the team file and the configuration share: the kind of a value as an error message names
// it, the check for control characters, the "did you mean" of an unknown key, and the error that carries every problem
// of a file. Every key a reader does not know is an error, and the JSON reader refuses an object that names a key twice.

import { JsonError, jsonProblem, parseJson } from './json.js';

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.map((p) => p.text).join('\n'));
    this.problems = problems;
  }
}

export const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v === 'object' ? 'an object' : typeof v === 'string' ? 'a string' : typeof v === 'number' ? 'a number' : 'a boolean');

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Control characters, and the direction controls and line separators that could rewrite a terminal or a report.
export const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/;

// The edit distance of two short words, for the "did you mean" of an unknown key.
export function distance(a, b) {
  if (a.length > 40 || b.length > 40) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

// The message of an unknown key: the nearest known key when it is close, or the list of the keys.
export function unknownKey(key, known) {
  const near = known.map((k) => [k, distance(k.toLowerCase(), key.toLowerCase())]).sort((a, b) => a[1] - b[1])[0];
  return `unknown key${near && near[1] <= 3 ? `; did you mean ${near[0]}?` : `; the keys here are ${known.join(', ')}`}`;
}

// A problem collector for one file: bad(path, message) records "file:line: path: message".
export function collector(file, lines) {
  const problems = [];
  const at = (path) => (path === '' ? file : `${file}${lines.has(path) ? `:${lines.get(path)}` : ''}: ${path}`);
  const bad = (path, message) => {
    problems.push({ path, text: `${at(path)}: ${message}` });
    return undefined;
  };
  const has = (prefix) => problems.some((p) => p.path === prefix || p.path.startsWith(`${prefix}.`) || p.path.startsWith(`${prefix}[`));
  return { problems, bad, has };
}

// Reads a JSON text with the strict reader, or throws ConfigError with the line and column of the problem.
export function readStrictJson(text, file, limits) {
  try {
    return parseJson(text, limits);
  } catch (error) {
    if (error instanceof JsonError) throw new ConfigError([{ path: '', text: `${file}: ${jsonProblem(error, text)}` }]);
    throw error;
  }
}
