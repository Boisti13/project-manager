// Activity log entries (GET /api/tasks/:id/activity) as sentences.
import { describeRecurrence } from './recurrence';

const STATUS = { todo: 'To Do', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done' };
const PRIORITY = { 0: 'Low', 1: 'Medium', 2: 'High', 3: 'Critical' };

const status = (s) => STATUS[s] || s;
const priority = (p) => PRIORITY[p] || `P${p}`;

// "2026-10-01" -> local date text, without timezone shifts.
export function formatDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString() : iso || '';
}

function repeatText(value) {
  const [unit, n] = (value || '').split(':');
  return describeRecurrence(unit, parseInt(n, 10) || 1).replace(/^Repeats /, '');
}

/** What happened, without the actor: "changed status from To Do to Done". */
export function describeActivity({ kind, actor, old_value: o, new_value: n }, fmtDay = formatDay) {
  switch (kind) {
    case 'created':
      return 'created the task';
    case 'title':
      return `renamed it from “${o}” to “${n}”`;
    case 'description':
      return 'edited the description';
    case 'status':
      if (n === 'done') return 'completed it';
      if (o === 'done') return `reopened it (${status(n)})`;
      return `changed status from ${status(o)} to ${status(n)}`;
    case 'priority':
      return `changed priority from ${priority(o)} to ${priority(n)}`;
    case 'deadline':
      if (!n) return 'removed the deadline';
      if (!o) return `set the deadline to ${fmtDay(n)}`;
      return `moved the deadline from ${fmtDay(o)} to ${fmtDay(n)}`;
    case 'assignee':
      if (!n) return o ? `unassigned ${o}` : 'unassigned it';
      if (n === actor) return o ? `took it over from ${o}` : 'took it on';
      if (!o) return `assigned it to ${n}`;
      return `reassigned it from ${o} to ${n}`;
    case 'project':
      return `moved it from ${o || 'No project'} to ${n || 'No project'}`;
    case 'labels':
      if (!o) return `labeled it ${n}`;
      if (!n) return `removed the labels (${o})`;
      return `changed labels from ${o} to ${n}`;
    case 'recurrence':
      return n ? `made it repeat ${repeatText(n)}` : 'stopped repeating it';
    case 'next_created':
      return n ? `created the next occurrence (due ${fmtDay(n)})` : 'created the next occurrence';
    case 'repeat_of':
      return 'created it as the next occurrence of a repeating task';
    default:
      return kind;
  }
}
