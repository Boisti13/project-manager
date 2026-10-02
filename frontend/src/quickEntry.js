// Quick entry: "Call supplier tomorrow !high #hardware @anna" -> the title
// "Call supplier" plus deadline, priority, labels and assignee. English and
// German words are understood whatever the interface language. No React here.
//
// - Deadline: today, tomorrow, day after tomorrow, monday … sunday (also mon,
//   tue, …; "next friday"), in 3 days / weeks / months, next week (its
//   Monday), end of month, 5.10. / 5.10.2026 / 2026-10-05; German: heute,
//   morgen, übermorgen, montag … sonntag, in 3 tagen / wochen / monaten,
//   nächste woche, monatsende. A leading "due", "by", "on", "until", "bis",
//   "am" or "zum" goes with it. Weekdays mean the next one (today counts).
// - Priority: !low !medium !high !critical (or !0 … !3; German !niedrig
//   !mittel !hoch !kritisch; !urgent / !dringend = critical).
// - Labels: #name, an existing label; spaces in its name as - or _, or the
//   start of the name when only one label begins like that.
// - Assignee: @username of someone who can be assigned, @me / @ich.
// The first deadline and priority count; anything not recognized stays in the title.

const WEEKDAYS = [
  ['monday', 'mon', 'montag'],
  ['tuesday', 'tue', 'tues', 'dienstag'],
  ['wednesday', 'wed', 'mittwoch'],
  ['thursday', 'thu', 'thur', 'thurs', 'donnerstag'],
  ['friday', 'fri', 'freitag'],
  ['saturday', 'samstag', 'sonnabend'], // not "sat" and "sun": ordinary words
  ['sunday', 'sonntag'],
]; // Monday = 0, as the server counts weekdays
const WEEKDAY_OF = new Map(WEEKDAYS.flatMap((names, i) => names.map((n) => [n, i])));

const PRIORITY_OF = {
  low: 0, niedrig: 0, '0': 0,
  medium: 1, mittel: 1, '1': 1,
  high: 2, hoch: 2, '2': 2,
  critical: 3, kritisch: 3, urgent: 3, dringend: 3, '3': 3,
};

const UNITS = {
  day: 'day', days: 'day', tag: 'day', tage: 'day', tagen: 'day',
  week: 'week', weeks: 'week', woche: 'week', wochen: 'week',
  month: 'month', months: 'month', monat: 'month', monate: 'month', monaten: 'month',
};

const L = '[\\p{L}\\p{N}]';
const START = `(?<!${L})`;
const END = `(?!${L})`;
const LEAD = '(?:(?:due|by|on|until|bis|am|zum|fällig)\\s+)?';
const WEEKDAY_WORDS = [...WEEKDAY_OF.keys()].sort((a, b) => b.length - a.length).join('|');
const DATE_PATTERNS = [
  `day after tomorrow|übermorgen`,
  `today|heute|tomorrow|tmrw|morgen`,
  `in\\s+(\\d{1,3})\\s+(${Object.keys(UNITS).join('|')})`,
  `next\\s+week|nächste\\s+woche`,
  `end\\s+of\\s+(?:the\\s+)?month|monatsende|ende\\s+des\\s+monats`,
  `(?:next\\s+|nächsten\\s+|nächster\\s+|kommenden\\s+)?(${WEEKDAY_WORDS})`,
  `(\\d{4})-(\\d{2})-(\\d{2})`,
  `(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2})?`,
];
const DATE_RE = new RegExp(`${START}${LEAD}(?:${DATE_PATTERNS.map((p) => `(${p})`).join('|')})${END}`, 'giu');

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const weekdayOf = (d) => (d.getDay() + 6) % 7; // Monday = 0

function addMonths(d, n) {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

/** The date a matched date phrase means, from `today` (a local Date); null if it's no real date. */
function dateFrom(m, today) {
  const word = (m[0] || '').toLowerCase();
  if (m[1]) return addDays(today, 2);
  if (m[2]) {
    if (/today|heute/.test(word)) return today;
    return addDays(today, 1);
  }
  if (m[3]) {
    const n = Number(m[4]);
    const unit = UNITS[m[5].toLowerCase()];
    return unit === 'day' ? addDays(today, n) : unit === 'week' ? addDays(today, 7 * n) : addMonths(today, n);
  }
  if (m[6]) return addDays(today, 7 - weekdayOf(today)); // next week's Monday
  if (m[7]) return new Date(today.getFullYear(), today.getMonth() + 1, 0);
  if (m[8]) {
    const day = WEEKDAY_OF.get(m[9].toLowerCase());
    let ahead = (day - weekdayOf(today) + 7) % 7;
    if (ahead === 0 && /next|nächst|kommend/.test(word)) ahead = 7;
    return addDays(today, ahead);
  }
  let y;
  let mo;
  let d;
  if (m[10]) [y, mo, d] = [Number(m[11]), Number(m[12]), Number(m[13])];
  else {
    [d, mo] = [Number(m[15]), Number(m[16])];
    if (m[17]) y = m[17].length === 2 ? 2000 + Number(m[17]) : Number(m[17]);
    else {
      // No year: the next time that day comes.
      y = today.getFullYear();
      if (new Date(y, mo - 1, d) < today) y += 1;
    }
  }
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

const norm = (s) => s.toLowerCase().trim().replace(/[\s_]+/g, '-');

function findLabel(name, labels) {
  const want = norm(name);
  const exact = labels.find((l) => norm(l.name) === want);
  if (exact) return exact;
  const starts = want.length >= 2 ? labels.filter((l) => norm(l.name).startsWith(want)) : [];
  return starts.length === 1 ? starts[0] : null;
}

/**
 * Parses `text`. labels: [{id, name}], users: [{id, username}] (who can be
 * assigned), me: the current user's id, today: a Date (local), ignore: keys
 * of tokens to leave in the title (see token.key).
 *
 * Returns { title, deadline ('YYYY-MM-DD' or null), priority (or null),
 * labelIds, assigneeId (or null), tokens: [{ key, kind, text, value }] }.
 */
export function parseQuickEntry(text, { labels = [], users = [], me = null, today = new Date(), ignore = new Set() } = {}) {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const spans = [];
  const tokens = [];
  const take = (start, end, token) => {
    if (spans.some(([s, e]) => start < e && end > s)) return false;
    const key = `${token.kind}:${text.slice(start, end).trim().toLowerCase()}`;
    if (ignore.has(key)) return false;
    spans.push([start, end]);
    tokens.push({ key, text: text.slice(start, end).trim(), ...token });
    return true;
  };

  let priority = null;
  for (const m of text.matchAll(/(?<!\S)!(\p{L}+|\d)(?!\S)/gu)) {
    const value = PRIORITY_OF[m[1].toLowerCase()];
    if (value !== undefined && priority === null && take(m.index, m.index + m[0].length, { kind: 'priority', value })) {
      priority = value;
    }
  }

  const labelIds = [];
  for (const m of text.matchAll(/(?<!\S)#([^\s#@!]+)/gu)) {
    const label = findLabel(m[1], labels);
    if (label && !labelIds.includes(label.id) && take(m.index, m.index + m[0].length, { kind: 'label', value: label.id, label })) {
      labelIds.push(label.id);
    }
  }

  let assigneeId = null;
  for (const m of text.matchAll(/(?<!\S)@([\p{L}\p{N}._-]+)/gu)) {
    const name = m[1].toLowerCase();
    const user = name === 'me' || name === 'ich' ? users.find((u) => u.id === me) : users.find((u) => u.username.toLowerCase() === name);
    if (user && assigneeId === null && take(m.index, m.index + m[0].length, { kind: 'assignee', value: user.id, user })) {
      assigneeId = user.id;
    }
  }

  let deadline = null;
  for (const m of text.matchAll(DATE_RE)) {
    if (deadline) break;
    const date = dateFrom(m, day);
    if (date && take(m.index, m.index + m[0].length, { kind: 'deadline', value: isoDate(date) })) deadline = isoDate(date);
  }

  spans.sort((a, b) => a[0] - b[0]);
  let title = '';
  let pos = 0;
  for (const [s, e] of spans) {
    title += text.slice(pos, s);
    pos = e;
  }
  title = (title + text.slice(pos)).replace(/\s+/g, ' ').trim();
  return { title, deadline, priority, labelIds, assigneeId, tokens };
}
