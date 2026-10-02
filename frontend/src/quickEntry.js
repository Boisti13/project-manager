// Quick entry: "Call supplier tomorrow !high #hardware @anna" -> the title
// "Call supplier" plus deadline, priority, labels and assignee. English and
// German words are understood whatever the interface language. No React here.
//
// - Deadline: today, tomorrow, day after tomorrow, monday … sunday (also mon,
//   tue, …; "next friday"), in 3 days / weeks / months / years, next week
//   (its Monday), end of month, 5.10. / 5.10.2026 / 2026-10-05; German:
//   heute, morgen, übermorgen, montag … sonntag, in 3 tagen / wochen /
//   monaten, nächste woche, monatsende. A leading "due", "by", "on", "to",
//   "until", "bis", "am" or "zum" goes with it. Weekdays mean the next one
//   (today counts).
// - Start: "from" / "starting" / "ab" / "von" / "vom" + a date ("from monday",
//   "von 5.10. bis 9.10."), or a range of dates "5.10.–9.10.".
// - Repeat: every day / week / month / year, daily, weekly, monthly, yearly,
//   every workday, every 2 weeks, every monday (and thursday); German
//   täglich, wöchentlich, monatlich, jährlich, jeden Werktag / werktags,
//   alle 2 Wochen, jeden Montag (und Donnerstag), montags. Without a
//   deadline, the first one is the next of those days (or today). Words like
//   "monthly" count only after the title has begun ("Monthly report" is a title).
// - Priority: !low !medium !high !critical (or !0 … !3; German !niedrig
//   !mittel !hoch !kritisch; !urgent / !dringend = critical).
// - Labels: #name, an existing label; spaces in its name as - or _, or the
//   start of the name when only one label begins like that.
// - Assignee: @username of someone who can be assigned, @me / @ich.
// The first of each counts; anything not recognized stays in the title.

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
const WEEKDAY_ADVERBS = ['montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags', 'sonntags'];

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
  year: 'year', years: 'year', jahr: 'year', jahre: 'year', jahren: 'year',
};

const L = '[\\p{L}\\p{N}]';
const START = `(?<!${L})`;
const END = `(?!${L})`;
const UNIT_WORDS = Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|');
const WD = [...WEEKDAY_OF.keys()].sort((a, b) => b.length - a.length).join('|');

// A date phrase; its groups are read by dateFrom (keep the numbering in step).
const DATE_CORE = [
  `day after tomorrow|übermorgen`, // 1
  `today|heute|tomorrow|tmrw|morgen`, // 2
  `in\\s+(\\d{1,3})\\s+(${UNIT_WORDS})`, // 3: 4, 5
  `next\\s+week|nächste\\s+woche`, // 6
  `end\\s+of\\s+(?:the\\s+)?month|monatsende|ende\\s+des\\s+monats`, // 7
  `(?:next\\s+|nächsten\\s+|nächster\\s+|kommenden\\s+)?(${WD})`, // 8: 9
  `(\\d{4})-(\\d{2})-(\\d{2})`, // 10: 11, 12, 13
  `(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2})?`, // 14: 15, 16, 17
].map((p) => `(${p})`).join('|');

const DEADLINE_RE = new RegExp(`${START}(?:(?:due|by|on|to|till|until|bis|am|zum|fällig)\\s+)?(?:${DATE_CORE})${END}`, 'giu');
const START_RE = new RegExp(`${START}(?:from|starting|ab|vom|von)\\s+(?:${DATE_CORE})${END}`, 'giu');
const NUMERIC = `\\d{1,2}\\.\\d{1,2}\\.(?:\\d{4}|\\d{2})?|\\d{4}-\\d{2}-\\d{2}`;
const RANGE_RE = new RegExp(`${START}(${NUMERIC})\\s*[-–]\\s*(${NUMERIC})${END}`, 'gu');
const REPEAT_RE = new RegExp(
  `${START}(?:` +
    [
      `(every\\s+day|daily|täglich|jeden\\s+tag)`, // 1
      `(every\\s+(?:work|week)day|jeden\\s+werktag|werktags)`, // 2
      `(every\\s+week|weekly|wöchentlich|jede\\s+woche)`, // 3
      `(every\\s+month|monthly|monatlich|jeden\\s+monat)`, // 4
      `(every\\s+year|yearly|annually|jährlich|jedes\\s+jahr)`, // 5
      `(?:every|alle)\\s+(\\d{1,3})\\s+(${UNIT_WORDS})`, // 6, 7
      `(?:every|jeden|jede)\\s+((?:${WD})(?:\\s*(?:,|and|und)\\s*(?:${WD}))*)`, // 8
      `(${WEEKDAY_ADVERBS.join('|')})`, // 9
    ].join('|') +
    `)${END}`,
  'giu'
);

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const weekdayOf = (d) => (d.getDay() + 6) % 7; // Monday = 0

function addMonths(d, n) {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

function exactDate(y, mo, d) {
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** "5.10.", "5.10.26", "2026-10-05" -> a Date (without a year: the next time that day comes). */
function numericDate(text, today) {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) return exactDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?$/.exec(text);
  if (!m) return null;
  const [d, mo] = [Number(m[1]), Number(m[2])];
  let y;
  if (m[3]) y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  else {
    y = today.getFullYear();
    if (new Date(y, mo - 1, d) < today) y += 1;
  }
  return exactDate(y, mo, d);
}

/** The date a DATE_CORE match means, from `today` (a local Date); null if it's no real date. */
function dateFrom(m, today) {
  const word = (m[0] || '').toLowerCase();
  if (m[1]) return addDays(today, 2);
  if (m[2]) return /today|heute/.test(word) ? today : addDays(today, 1);
  if (m[3]) {
    const n = Number(m[4]);
    const unit = UNITS[m[5].toLowerCase()];
    if (unit === 'day') return addDays(today, n);
    if (unit === 'week') return addDays(today, 7 * n);
    return addMonths(today, unit === 'year' ? 12 * n : n);
  }
  if (m[6]) return addDays(today, 7 - weekdayOf(today)); // next week's Monday
  if (m[7]) return new Date(today.getFullYear(), today.getMonth() + 1, 0);
  if (m[8]) {
    const day = WEEKDAY_OF.get(m[9].toLowerCase());
    let ahead = (day - weekdayOf(today) + 7) % 7;
    if (ahead === 0 && /next|nächst|kommend/.test(word)) ahead = 7;
    return addDays(today, ahead);
  }
  return numericDate((m[10] || m[14]).trim(), today);
}

/** The repeat a REPEAT_RE match means: { unit, interval, weekdays }. */
function repeatFrom(m) {
  if (m[1]) return { unit: 'day', interval: 1, weekdays: null };
  if (m[2]) return { unit: 'week', interval: 1, weekdays: [0, 1, 2, 3, 4] };
  if (m[3]) return { unit: 'week', interval: 1, weekdays: null };
  if (m[4]) return { unit: 'month', interval: 1, weekdays: null };
  if (m[5]) return { unit: 'year', interval: 1, weekdays: null };
  if (m[6]) return { unit: UNITS[m[7].toLowerCase()], interval: Number(m[6]), weekdays: null };
  if (m[8]) {
    const days = m[8].toLowerCase().split(/\s*(?:,|and|und)\s*/).map((w) => WEEKDAY_OF.get(w.trim()));
    return { unit: 'week', interval: 1, weekdays: [...new Set(days)].sort((a, b) => a - b) };
  }
  return { unit: 'week', interval: 1, weekdays: [WEEKDAY_ADVERBS.indexOf(m[9].toLowerCase())] };
}

/** A repeating task's first deadline when none is given: the next of its days, else today. */
function firstOccurrence(repeat, today) {
  if (!repeat.weekdays || !repeat.weekdays.length) return today;
  const ahead = Math.min(...repeat.weekdays.map((d) => (d - weekdayOf(today) + 7) % 7));
  return addDays(today, ahead);
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
 * Returns { title, deadline, startDate ('YYYY-MM-DD' or null), priority (or
 * null), labelIds, assigneeId (or null), repeat ({unit, interval, weekdays}
 * or null), tokens: [{ key, kind, text, value }] }.
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
  const span = (m) => [m.index, m.index + m[0].length];

  let priority = null;
  for (const m of text.matchAll(/(?<!\S)!(\p{L}+|\d)(?!\S)/gu)) {
    const value = PRIORITY_OF[m[1].toLowerCase()];
    if (value !== undefined && priority === null && take(...span(m), { kind: 'priority', value })) priority = value;
  }

  const labelIds = [];
  for (const m of text.matchAll(/(?<!\S)#([^\s#@!]+)/gu)) {
    const label = findLabel(m[1], labels);
    if (label && !labelIds.includes(label.id) && take(...span(m), { kind: 'label', value: label.id, label })) {
      labelIds.push(label.id);
    }
  }

  let assigneeId = null;
  for (const m of text.matchAll(/(?<!\S)@([\p{L}\p{N}._-]+)/gu)) {
    const name = m[1].toLowerCase();
    const user = name === 'me' || name === 'ich' ? users.find((u) => u.id === me) : users.find((u) => u.username.toLowerCase() === name);
    if (user && assigneeId === null && take(...span(m), { kind: 'assignee', value: user.id, user })) assigneeId = user.id;
  }

  let repeat = null;
  for (const m of text.matchAll(REPEAT_RE)) {
    // "Monthly report", "Täglicher …": a word like that first is part of the
    // title; later ("Pay rent monthly") or as "every …" it's a repeat.
    if (!/^(every|jeden|jede|alle)\s/i.test(m[0]) && !text.slice(0, m.index).trim()) continue;
    const value = repeatFrom(m);
    if (!repeat && take(...span(m), { kind: 'repeat', value })) repeat = value;
  }

  let startDate = null;
  let deadline = null;
  for (const m of text.matchAll(RANGE_RE)) {
    const [from, to] = [numericDate(m[1], day), numericDate(m[2], day)];
    if (!startDate && !deadline && from && to && take(...span(m), { kind: 'range', value: [isoDate(from), isoDate(to)] })) {
      [startDate, deadline] = [isoDate(from), isoDate(to)];
    }
  }
  for (const m of text.matchAll(START_RE)) {
    const date = dateFrom(m, day);
    if (!startDate && date && take(...span(m), { kind: 'start', value: isoDate(date) })) startDate = isoDate(date);
  }
  for (const m of text.matchAll(DEADLINE_RE)) {
    const date = dateFrom(m, day);
    if (!deadline && date && take(...span(m), { kind: 'deadline', value: isoDate(date) })) deadline = isoDate(date);
  }
  if (repeat && !deadline) deadline = isoDate(firstOccurrence(repeat, day));

  spans.sort((a, b) => a[0] - b[0]);
  let title = '';
  let pos = 0;
  for (const [s, e] of spans) {
    title += text.slice(pos, s);
    pos = e;
  }
  title = (title + text.slice(pos)).replace(/\s+/g, ' ').trim();
  return { title, deadline, startDate, priority, labelIds, assigneeId, repeat, tokens };
}

/** Applies parseQuickEntry to every item of a parseBulk tree (items get the fields the bulk API takes). */
export function quickEntryTree(items, options) {
  return items.map((item) => {
    const q = parseQuickEntry(item.title, options);
    const out = { ...item, title: q.title || item.title, children: quickEntryTree(item.children, options), quick: q };
    if (q.deadline) out.deadline = q.deadline;
    if (q.startDate) out.start_date = q.startDate;
    if (q.priority !== null) out.priority = q.priority;
    if (q.labelIds.length) out.label_ids = q.labelIds;
    if (q.assigneeId !== null) out.assignee_id = q.assigneeId;
    if (q.repeat) {
      out.recurrence_unit = q.repeat.unit;
      out.recurrence_interval = q.repeat.interval;
      if (q.repeat.weekdays) out.recurrence_weekdays = q.repeat.weekdays;
    }
    return out;
  });
}
