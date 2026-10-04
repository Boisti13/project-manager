import { quickAddBody } from './QuickAdd';
import { parseQuickEntry } from '../quickEntry';

const today = new Date(2026, 9, 2); // a Friday
const labels = [{ id: 1, name: 'hardware' }];
const users = [{ id: 10, username: 'anna' }, { id: 11, username: 'me' }];
const body = (text, opts = {}) =>
  quickAddBody(text, parseQuickEntry(text, { labels, users, me: 11, today }), { projectId: 5, me: 11, ...opts });

test('quick add: yours unless @someone, with what the title says', () => {
  expect(body('Call supplier tomorrow !high #hardware')).toEqual({
    title: 'Call supplier', project_id: 5, assignee_id: 11, priority: 2, label_ids: [1],
    deadline: '2026-10-03', start_date: null,
  });
  expect(body('Ask @anna').assignee_id).toBe(10);
  expect(body('Plain', { projectId: null })).toMatchObject({ title: 'Plain', project_id: null, priority: 0, deadline: null });
});

test('quick add: repeats and ranges', () => {
  expect(body('Sync every monday')).toMatchObject({
    title: 'Sync', recurrence_unit: 'week', recurrence_interval: 1, recurrence_weekdays: [0], deadline: '2026-10-05',
  });
  expect(body('Fair 5.10.–9.10.')).toMatchObject({ start_date: '2026-10-05', deadline: '2026-10-09' });
});
