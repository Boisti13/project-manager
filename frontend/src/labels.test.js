// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { buildLabelIndex, labelTextColor } from './labels';
import { buildTaskTree, DEFAULT_FILTERS } from './taskFilters';

const labels = [
  { id: 1, name: 'urgent', color: '#f44336' },
  { id: 2, name: 'Waiting', color: '#fff176' },
];

test('label index sorts a task’s labels by name and skips unknown ids', () => {
  const idx = buildLabelIndex(labels);
  assert.deepStrictEqual(idx.of({ label_ids: [2, 99, 1] }).map((l) => l.name), ['urgent', 'Waiting']);
  assert.deepStrictEqual(idx.of({}), []);
  assert.strictEqual(idx.nameOf(2), 'Waiting');
});

test('readable text color', () => {
  assert.strictEqual(labelTextColor('#fff176'), '#1a1a1a');
  assert.strictEqual(labelTextColor('#3f51b5'), '#fff');
  assert.strictEqual(labelTextColor('nonsense'), '#fff');
});

test('label filter and search by label name', () => {
  const tasks = [
    { id: 1, title: 'Order cables', parent_task_id: null, status: 'todo', label_ids: [1] },
    { id: 2, title: 'Ask supplier', parent_task_id: 1, status: 'todo', label_ids: [2] },
    { id: 3, title: 'Other', parent_task_id: null, status: 'todo' },
  ];
  const idx = buildLabelIndex(labels);
  const byLabel = buildTaskTree(tasks, { ...DEFAULT_FILTERS, label: '2' }, { labelNameOf: idx.nameOf });
  assert.deepStrictEqual([...byLabel.matchedIds], [2]);
  assert.deepStrictEqual(byLabel.roots.map((t) => t.id), [1]); // shown as context
  const byText = buildTaskTree(tasks, { ...DEFAULT_FILTERS, q: 'urg' }, { labelNameOf: idx.nameOf });
  assert.deepStrictEqual([...byText.matchedIds], [1]);
});
