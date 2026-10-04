// Logins. GitHub logins are compared without case, so every login is kept in its written form for the reports and
// compared through loginKey(). Bots are left out of every number: an account whose user.type is "Bot", and every login
// that a pattern of the configuration matches. A pattern is a login in which * stands for any run of characters; it is
// matched by the loop below, never turned into a regular expression, so a pattern cannot make the match slow.

export const LOGIN_LIMITS = { maxLogin: 39, maxPattern: 60, maxPatterns: 100 };

// The normal form of a login for comparison. GitHub logins are ASCII, so the case is folded on ASCII letters only, and
// the result does not depend on the locale of the machine.
export const loginKey = (login) => String(login).replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

// A login as GitHub writes it: letters, digits and single hyphens, not starting or ending with a hyphen, at most 39
// characters. A bot account ends in [bot].
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
export const isLogin = (text) => typeof text === 'string' && LOGIN.test(text);

// A pattern of the configuration: the characters of a login, the brackets of [bot], and *.
const PATTERN = /^[A-Za-z0-9*[\]-]+$/;
export const isPattern = (text) => typeof text === 'string' && text.length <= LOGIN_LIMITS.maxPattern && PATTERN.test(text);

// Does a pattern match a login, without case? * matches any run of characters, also an empty one. The loop keeps the
// last * and where it started, so the work is at most the product of the two lengths.
export function globMatch(pattern, login) {
  const p = loginKey(pattern);
  const s = loginKey(login);
  let i = 0;
  let j = 0;
  let star = -1;
  let mark = 0;
  while (j < s.length) {
    if (i < p.length && p[i] !== '*' && p[i] === s[j]) {
      i += 1;
      j += 1;
    } else if (i < p.length && p[i] === '*') {
      star = i;
      mark = j;
      i += 1;
    } else if (star >= 0) {
      i = star + 1;
      mark += 1;
      j = mark;
    } else return false;
  }
  while (i < p.length && p[i] === '*') i += 1;
  return i === p.length;
}

// Is an account a bot: user.type "Bot", or a login that one of the patterns matches.
export function isBot(login, type, patterns) {
  if (type === 'Bot') return true;
  return patterns.some((p) => globMatch(p, login));
}
