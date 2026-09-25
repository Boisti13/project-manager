// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { tasksToCsv, CSV_COLUMNS } from './exportCsv';
import { buildProjectIndex } from './projects';

test('CSV export: projects, categories, inherited project, quoting, BOM', () => {
  const idx = buildProjectIndex([
    { id: 1, name: '6GHub', color: '#2196f3', parent_id: null },
    { id: 2, name: 'Ordering', color: null, parent_id: 1 },
  ]);
  const tasks = [
    { id: 1, title: 'Order modules', project_id: 2, parent_task_id: null, status: 'done', priority: 3,
      assignee_id: 7, deadline: '2026-09-20T00:00:00', created_at: '2026-09-01T10:00:00',
      completed_at: '2026-09-21T08:00:00', description: 'Größe: "XL"; 2 Stück' },
    { id: 2, title: 'Check quote', project_id: null, parent_task_id: 1, status: 'todo', priority: 0,
      assignee_id: null, deadline: null, created_at: '2026-09-02T10:00:00', completed_at: null, description: null },
    { id: 3, title: 'Loose task', project_id: null, parent_task_id: null, status: 'blocked', priority: 1,
      assignee_id: null, deadline: null, created_at: '2026-09-03T10:00:00', completed_at: null, description: 'two\nlines' },
  ];
  const csv = tasksToCsv(tasks, idx, [{ id: 7, username: 'bastian' }]);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).split('\r\n');
  assert.strictEqual(lines[0], CSV_COLUMNS.join(';'));
  assert.strictEqual(
    lines[1],
    '1;6GHub;Ordering;Order modules;;Done;Critical;bastian;2026-09-20;2026-09-01;2026-09-21;"Größe: ""XL""; 2 Stück"'
  );
  assert.strictEqual(lines[2], '2;6GHub;Ordering;Check quote;Order modules;To Do;Low;;;2026-09-02;;');
  // The quoted description keeps its own line break inside the field.
  assert.strictEqual(lines[3], '3;;;Loose task;;Blocked;Medium;;;2026-09-03;;"two\nlines"');
  assert.strictEqual(lines.length, 5); // header, 3 rows, trailing empty
});
