// The three reports: text for a terminal, Markdown for a ticket or a job summary, and JSON for other tools. Every text
// from the input (a login, a team name) was cleaned by safeText before it reached the report. The Markdown report also
// escapes each cell, so a value cannot break a table, make a link or be read as HTML, and a cell that starts with =, +,
// -, @, a tab or a carriage return gets a leading apostrophe, so a spreadsheet that the table is pasted into does not
// read it as a formula. The reports show logins, time zones, pull numbers and times, and nothing else of the input.

import { grouped, plural } from './size.js';

const FORMULA_START = new Set(['=', '+', '-', '@', '\t', '\r']);

// A cell that a spreadsheet would read as a formula, with a leading apostrophe.
export function guardFormula(t) {
  const s = String(t);
  return s.length && FORMULA_START.has(s[0]) ? `'${s}` : s;
}

export function mdCell(t) {
  return guardFormula(String(t))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[[\]`*_]/g, (c) => `\\${c}`)
    .replace(/\r?\n|\r/g, ' ');
}

// Whole minutes as the reports write them: 0h 05m, 26h 40m, and a dash for no value.
export function minutesText(m) {
  if (m === null || m === undefined) return '-';
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// Pads the columns of a table of text to their widths.
function table(rows, indent = '  ') {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => String(row[i]).length)));
  return rows.map((row) => `${indent}${row.map((cell, i) => (i === row.length - 1 ? String(cell) : String(cell).padEnd(widths[i]))).join('  ')}`.trimEnd());
}

const filesLine = (r) => `${r.files.pulls}, team ${r.files.team}${r.team.name ? ` (${r.team.name})` : ''}, configuration ${r.files.config}`;
const botsLine = (r) => `${r.bots.length ? `${r.bots.join(', ')} and ` : ''}every account of type Bot`;
const dataLine = (r) => `${r.span.first} to ${r.span.last}${r.asOf ? `; open pull requests measured until --as-of ${r.asOf}` : ''}`;
const changeText = (c) => `${c.zone} from ${c.before} to ${c.after} on ${c.label}`;
function pullsLine(r) {
  const c = r.counts;
  const left = Object.values(c.excluded).reduce((a, b) => a + b, 0);
  const parts = [`${grouped(c.reviewed)} reviewed`];
  if (c.closedUnreviewed) parts.push(`${grouped(c.closedUnreviewed)} closed with no review`);
  if (c.openUnreviewed) parts.push(`${grouped(c.openUnreviewed)} open with no review`);
  return `${grouped(c.read)} read, ${grouped(c.measured)} measured: ${parts.join(', ')}; ${grouped(c.approved)} approved, ${grouped(c.merged)} merged${left ? `; ${grouped(left)} left out` : ''}`;
}
const pLabel = (r) => `p${r.percentile}`;
const lateLine = (l) => (l.kind === 'review'
  ? `${l.author} (${l.authorZone}), first review by ${l.by} (${l.reviewerZone}) at ${l.end}`
  : `${l.author} (${l.authorZone}), no review, ${l.kind === 'closed-unreviewed' ? 'closed at' : 'still open at --as-of'} ${l.end}`);
const statCells = (s) => [minutesText(s.median), minutesText(s.upper), minutesText(s.max)];
const pair = (w) => (w ? `${minutesText(w.wallMinutes)} / ${minutesText(w.workingMinutes)}` : '-');
const reviewCell = (p) => (p.firstReview ? `${p.firstReview.by} ${pair(p.firstReview)}` : p.unreviewed.kind === 'open' ? 'none, open' : `none, ${p.unreviewed.kind === 'closed' ? 'closed' : 'open'} ${pair(p.unreviewed)}`);

export function toText(r, { explain = false } = {}) {
  const out = [];
  out.push(`review-latency-check: ${filesLine(r)}`);
  out.push(`team: ${plural(r.team.people.length, 'person', 'people')} in ${plural(new Set(r.team.people.map((x) => x.zone)).size, 'time zone')}`);
  for (const line of table(r.team.people.map((x) => [x.login, x.zone, x.hours]))) out.push(line);
  out.push(`limit: ${r.limit.text}`);
  out.push(`percentile: ${pLabel(r)} and the median, both by the nearest-rank method`);
  out.push(`bots: ${botsLine(r)}`);
  out.push(`data: ${dataLine(r)}`);
  out.push(`clock changes: ${r.clockChanges.length ? r.clockChanges.map(changeText).join('; ') : 'none in the data'}`);
  out.push(`pulls: ${pullsLine(r)}`);
  out.push('', `Past the limit (${grouped(r.late.length)})`, '');
  if (!r.late.length) out.push('  none');
  else {
    for (const line of table(r.late.map((l) => [`#${l.number}`, lateLine(l), `${minutesText(l.wallMinutes)} on the wall, ${minutesText(l.workingMinutes)} working`]))) out.push(line);
  }
  out.push('', `First review by author zone and reviewer zone (wall / working hours of the reviewer)`, '');
  if (r.pairs.length) {
    const head = ['author zone', 'reviewer zone', 'pulls', 'median', pLabel(r), 'max', 'median', pLabel(r), 'max'];
    const rows = r.pairs.map((x) => [x.authorZone, x.reviewerZone, x.count, ...statCells(x.wall), ...statCells(x.working)]);
    for (const line of table([['', '', '', 'wall', '', '', 'working', '', ''], head, ...rows])) out.push(line);
  } else out.push('  no pull request was reviewed');
  out.push('', 'Every measured pull together', '');
  {
    const head = ['wait', 'working hours of', 'pulls', 'median', pLabel(r), 'max', 'median', pLabel(r), 'max'];
    const rows = r.overall.map((x) => [x.metric, x.hoursOf, x.count, ...statCells(x.wall), ...statCells(x.working)]);
    for (const line of table([['', '', '', 'wall', '', '', 'working', '', ''], head, ...rows])) out.push(line);
  }
  out.push('', 'Every pull (wall / working; * past the limit)', '');
  const rows = r.pulls.map((p) => [`#${p.number}${p.late ? '*' : ''}`, p.author, `ready ${p.ready}`, `review ${reviewCell(p)}`, `approval ${pair(p.firstApproval)}`, `merge ${pair(p.merge)}`]);
  const lines = table(rows);
  r.pulls.forEach((p, i) => {
    out.push(lines[i]);
    if (explain) for (const l of p.explain) out.push(`      ${l}`);
  });
  out.push('');
  if (explain && r.basis.length) {
    out.push('Basis', '');
    for (const b of r.basis) out.push(`  "${b.text}" (${b.section}, ${b.page})`);
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(`RESULT: ${r.verdict.text}`);
  return `${out.join('\n')}\n`;
}

export function toMarkdown(r, { explain = false } = {}) {
  const lines = [`## review-latency-check: ${r.verdict.text}`, ''];
  lines.push(`- Files: ${mdCell(filesLine(r))}`);
  lines.push(`- Limit: ${mdCell(r.limit.text)}`);
  lines.push(`- Percentile: ${pLabel(r)} and the median, both by the nearest-rank method`);
  lines.push(`- Bots: ${mdCell(botsLine(r))}`);
  lines.push(`- Data: ${mdCell(dataLine(r))}`);
  lines.push(`- Clock changes: ${r.clockChanges.length ? mdCell(r.clockChanges.map(changeText).join('; ')) : 'none in the data'}`);
  lines.push(`- Pulls: ${mdCell(pullsLine(r))}`);
  lines.push('', '### Team', '', '| Login | Time zone | Working hours (local time) |', '| --- | --- | --- |');
  for (const x of r.team.people) lines.push(`| ${mdCell(x.login)} | ${mdCell(x.zone)} | ${mdCell(x.hours)} |`);
  lines.push('', '### Past the limit', '');
  if (r.late.length) {
    lines.push('| Pull | What happened | Wall | Working |', '| --- | --- | --- | --- |');
    for (const l of r.late) lines.push(`| #${l.number} | ${mdCell(lateLine(l))} | ${minutesText(l.wallMinutes)} | ${minutesText(l.workingMinutes)} |`);
  } else lines.push('None.');
  lines.push('', '### First review by author zone and reviewer zone', '', 'Working hours are those of the reviewer.', '');
  lines.push(`| Author zone | Reviewer zone | Pulls | Wall median | Wall ${pLabel(r)} | Wall max | Working median | Working ${pLabel(r)} | Working max |`, '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const x of r.pairs) lines.push(`| ${mdCell(x.authorZone)} | ${mdCell(x.reviewerZone)} | ${x.count} | ${[...statCells(x.wall), ...statCells(x.working)].join(' | ')} |`);
  lines.push('', '### Every measured pull together', '');
  lines.push(`| Wait | Working hours of | Pulls | Wall median | Wall ${pLabel(r)} | Wall max | Working median | Working ${pLabel(r)} | Working max |`, '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const x of r.overall) lines.push(`| ${x.metric} | ${x.hoursOf} | ${x.count} | ${[...statCells(x.wall), ...statCells(x.working)].join(' | ')} |`);
  lines.push('', '### Every pull', '', 'Wall / working; a star marks a pull past the limit.', '');
  lines.push('| Pull | Author | Ready | First review | First approval | Merge |', '| --- | --- | --- | --- | --- | --- |');
  for (const p of r.pulls) lines.push(`| #${p.number}${p.late ? ' \\*' : ''} | ${mdCell(p.author)} | ${mdCell(p.ready)} | ${mdCell(reviewCell(p))} | ${pair(p.firstApproval)} | ${pair(p.merge)} |`);
  if (explain) {
    lines.push('', '### The moments behind each number', '', 'All moments are in UTC.');
    for (const p of r.pulls) {
      lines.push('', `#### #${p.number} by ${mdCell(p.author)}`, '');
      for (const l of p.explain) lines.push(`- ${mdCell(l.trim())}`);
    }
    if (r.basis.length) {
      lines.push('', '### Basis', '');
      for (const b of r.basis) lines.push(`- ${mdCell(`"${b.text}" (${b.section}, ${b.page})`)}`);
    }
  }
  if (r.notes.length) {
    lines.push('', '### Notes', '');
    for (const n of r.notes) lines.push(`- ${mdCell(n)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function toJson(r, { explain = false } = {}) {
  const out = {
    ...r,
    basis: explain ? r.basis : undefined,
    pulls: r.pulls.map((p) => (explain ? p : { ...p, explain: undefined }))
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}
