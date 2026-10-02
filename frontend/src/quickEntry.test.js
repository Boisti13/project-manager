import { parseQuickEntry, quickEntryTree } from './quickEntry';

// Friday, 2 October 2026
const today = new Date(2026, 9, 2, 15, 30);
const labels = [
  { id: 1, name: 'hardware' },
  { id: 2, name: 'waiting for supplier' },
  { id: 3, name: 'urgent' },
];
const users = [
  { id: 10, username: 'anna' },
  { id: 11, username: 'preview' },
];
const parse = (text, opts = {}) => parseQuickEntry(text, { labels, users, me: 11, today, ...opts });

test('everything at once', () => {
  const r = parse('Call supplier tomorrow !high #hardware @anna');
  expect(r).toMatchObject({ title: 'Call supplier', deadline: '2026-10-03', priority: 2, labelIds: [1], assigneeId: 10 });
  expect(r.tokens.map((x) => x.kind)).toEqual(['priority', 'label', 'assignee', 'deadline']);
});

test('dates in English and German', () => {
  const d = (text) => parse(`Do it ${text}`).deadline;
  expect(d('today')).toBe('2026-10-02');
  expect(d('heute')).toBe('2026-10-02');
  expect(d('morgen')).toBe('2026-10-03');
  expect(d('day after tomorrow')).toBe('2026-10-04');
  expect(d('übermorgen')).toBe('2026-10-04');
  expect(d('friday')).toBe('2026-10-02'); // today counts
  expect(d('Freitag')).toBe('2026-10-02');
  expect(d('next friday')).toBe('2026-10-09');
  expect(d('thursday')).toBe('2026-10-08');
  expect(d('Donnerstag')).toBe('2026-10-08');
  expect(d('mon')).toBe('2026-10-05');
  expect(d('in 3 days')).toBe('2026-10-05');
  expect(d('in 2 Wochen')).toBe('2026-10-16');
  expect(d('in 1 month')).toBe('2026-11-02');
  expect(d('next week')).toBe('2026-10-05');
  expect(d('nächste Woche')).toBe('2026-10-05');
  expect(d('end of month')).toBe('2026-10-31');
  expect(d('Monatsende')).toBe('2026-10-31');
  expect(d('5.10.')).toBe('2026-10-05');
  expect(d('1.9.')).toBe('2027-09-01'); // already past this year
  expect(d('24.12.2026')).toBe('2026-12-24');
  expect(d('3.1.27')).toBe('2027-01-03');
  expect(d('2026-11-15')).toBe('2026-11-15');
  expect(d('31.2.')).toBeNull(); // no such day
});

test('connecting words go with the date', () => {
  expect(parse('Send report by friday').title).toBe('Send report');
  expect(parse('Bericht schicken bis Freitag').title).toBe('Bericht schicken');
  expect(parse('Meeting am 5.10.').title).toBe('Meeting');
  expect(parse('Pay rent due end of month').title).toBe('Pay rent');
});

test('only whole words; the first date and priority count', () => {
  expect(parse('Monday meeting notes').deadline).toBe('2026-10-05');
  expect(parse('Monthly report')).toMatchObject({ deadline: null, repeat: null, title: 'Monthly report' });
  expect(parse('Pay rent monthly')).toMatchObject({ repeat: { unit: 'month' }, title: 'Pay rent' });
  expect(parse('Firmware 1.5 release').deadline).toBeNull();
  expect(parse('Update to 2.5.1').deadline).toBeNull();
  const r = parse('A tomorrow friday !low !high');
  expect(r.deadline).toBe('2026-10-03');
  expect(r.priority).toBe(0); // the first one
  expect(r.title).toBe('A friday !high');
});

test('priorities, labels and people that exist; the rest stays', () => {
  expect(parse('x !kritisch').priority).toBe(3);
  expect(parse('x !2').priority).toBe(2);
  expect(parse('x !urgent').priority).toBe(3);
  expect(parse('Wow!high').priority).toBeNull(); // not a separate word
  expect(parse('x !soon')).toMatchObject({ priority: null, title: 'x !soon' });

  expect(parse('x #waiting-for-supplier #urgent').labelIds).toEqual([2, 3]);
  expect(parse('x #waiting_for_supplier').labelIds).toEqual([2]);
  expect(parse('x #wait').labelIds).toEqual([2]); // the only label starting like that
  expect(parse('x #nope')).toMatchObject({ labelIds: [], title: 'x #nope' });
  expect(parse('issue #42').title).toBe('issue #42');

  expect(parse('x @me').assigneeId).toBe(11);
  expect(parse('x @ich').assigneeId).toBe(11);
  expect(parse('x @ANNA').assigneeId).toBe(10);
  expect(parse('mail bob@example.com @nobody')).toMatchObject({ assigneeId: null, title: 'mail bob@example.com @nobody' });
});

test('ignored tokens stay in the title', () => {
  const first = parse('Prepare monday meeting #hardware');
  const key = first.tokens.find((x) => x.kind === 'deadline').key;
  const r = parse('Prepare monday meeting #hardware', { ignore: new Set([key]) });
  expect(r).toMatchObject({ title: 'Prepare monday meeting', deadline: null, labelIds: [1] });
});

test('nothing recognized: the text as it is', () => {
  expect(parse('  Just a   task ')).toMatchObject({ title: 'Just a task', deadline: null, priority: null, labelIds: [], assigneeId: null, tokens: [] });
});

test('repeats', () => {
  const r = (text) => parse(`Sync ${text}`);
  expect(r('every monday')).toMatchObject({ title: 'Sync', repeat: { unit: 'week', interval: 1, weekdays: [0] }, deadline: '2026-10-05' });
  expect(r('every mon and thu').repeat.weekdays).toEqual([0, 3]);
  expect(r('jeden Montag und Donnerstag').repeat.weekdays).toEqual([0, 3]);
  expect(r('freitags')).toMatchObject({ repeat: { unit: 'week', weekdays: [4] }, deadline: '2026-10-02' }); // today counts
  expect(r('daily').repeat).toEqual({ unit: 'day', interval: 1, weekdays: null });
  expect(r('täglich').deadline).toBe('2026-10-02');
  expect(r('every workday').repeat.weekdays).toEqual([0, 1, 2, 3, 4]);
  expect(r('werktags').repeat.unit).toBe('week');
  expect(r('weekly').repeat).toEqual({ unit: 'week', interval: 1, weekdays: null });
  expect(r('monatlich').repeat.unit).toBe('month');
  expect(r('every year').repeat.unit).toBe('year');
  expect(r('every 2 weeks').repeat).toEqual({ unit: 'week', interval: 2, weekdays: null });
  expect(r('alle 3 Monate').repeat).toEqual({ unit: 'month', interval: 3, weekdays: null });
  // with its own first date
  expect(r('every month 15.10.')).toMatchObject({ repeat: { unit: 'month' }, deadline: '2026-10-15', title: 'Sync' });
});

test('start dates and ranges', () => {
  expect(parse('Trade fair from 5.10. to 9.10.')).toMatchObject({ title: 'Trade fair', startDate: '2026-10-05', deadline: '2026-10-09' });
  expect(parse('Messe von 5.10. bis 9.10.')).toMatchObject({ title: 'Messe', startDate: '2026-10-05', deadline: '2026-10-09' });
  expect(parse('Messe 5.10.–9.10.')).toMatchObject({ title: 'Messe', startDate: '2026-10-05', deadline: '2026-10-09' });
  expect(parse('Holiday 2026-12-21 - 2027-01-02')).toMatchObject({ startDate: '2026-12-21', deadline: '2027-01-02' });
  expect(parse('Build from monday')).toMatchObject({ title: 'Build', startDate: '2026-10-05', deadline: null });
  expect(parse('Report ab morgen bis Donnerstag')).toMatchObject({ startDate: '2026-10-03', deadline: '2026-10-08' });
  expect(parse('Pages 5-9').startDate).toBeNull(); // not dates
});

test('a whole list for "Several (one per line)"', () => {
  const items = [
    { title: 'Order parts tomorrow #hardware', children: [{ title: 'Cables !high @anna', children: [] }] },
    { title: 'Plain', children: [] },
    { title: 'Weekly sync every monday', children: [] },
  ];
  const [a, b, c] = quickEntryTree(items, { labels, users, me: 11, today });
  expect(a).toMatchObject({ title: 'Order parts', deadline: '2026-10-03', label_ids: [1] });
  expect(a.children[0]).toMatchObject({ title: 'Cables', priority: 2, assignee_id: 10 });
  expect(b).toEqual(expect.not.objectContaining({ deadline: expect.anything() }));
  expect(b.title).toBe('Plain');
  expect(c).toMatchObject({ title: 'Weekly sync', recurrence_unit: 'week', recurrence_interval: 1, recurrence_weekdays: [0], deadline: '2026-10-05' });
});
