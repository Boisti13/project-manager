// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { describeActivity } from './activity';

const d = (kind, old_value = null, new_value = null, actor = 'me') =>
  describeActivity({ kind, actor, old_value, new_value }, (x) => `<${x}>`);

test('describes activity entries', () => {
  assert.strictEqual(d('created'), 'created the task');
  assert.strictEqual(d('status', 'todo', 'in_progress'), 'changed status from To Do to In Progress');
  assert.strictEqual(d('status', 'in_progress', 'done'), 'completed it');
  assert.strictEqual(d('status', 'done', 'todo'), 'reopened it (To Do)');
  assert.strictEqual(d('priority', '0', '2'), 'changed priority from Low to High');
  assert.strictEqual(d('deadline', null, '2026-10-01'), 'set the deadline to <2026-10-01>');
  assert.strictEqual(d('deadline', '2026-10-01', null), 'removed the deadline');
  assert.strictEqual(d('assignee', null, 'bob'), 'assigned it to bob');
  assert.strictEqual(d('assignee', 'bob', 'alice'), 'reassigned it from bob to alice');
  assert.strictEqual(d('assignee', 'bob', null), 'unassigned bob');
  assert.strictEqual(d('assignee', null, 'me'), 'took it on');
  assert.strictEqual(d('assignee', 'bob', 'me'), 'took it over from bob');
  assert.strictEqual(d('project', '6GHub', '6GHub / Ordering'), 'moved it from 6GHub to 6GHub / Ordering');
  assert.strictEqual(d('labels', null, 'urgent'), 'labeled it urgent');
  assert.strictEqual(d('labels', 'urgent', 'urgent, waiting'), 'changed labels from urgent to urgent, waiting');
  assert.strictEqual(d('labels', 'urgent', null), 'removed the labels (urgent)');
  assert.strictEqual(d('blocked_by', null, '“Get quote”'), 'made it wait for “Get quote”');
  assert.strictEqual(d('blocked_by', '“A”', null), 'removed what it waited for (“A”)');
  assert.strictEqual(d('recurrence', null, 'week:1'), 'made it repeat weekly');
  assert.strictEqual(d('recurrence', null, 'day:3'), 'made it repeat every 3 days');
  assert.strictEqual(d('recurrence', 'day:3', null), 'stopped repeating it');
  assert.strictEqual(d('next_created', null, '2026-11-01'), 'created the next occurrence (due <2026-11-01>)');
});
