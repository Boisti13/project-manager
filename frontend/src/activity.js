// Activity log entries (GET /api/tasks/:id/activity) as sentences.
import { recurrenceHow } from './recurrence';
import { statusName, priorityName } from './names';
import { t, locale } from './i18n';

// "2026-10-01" -> local date text, without timezone shifts.
export function formatDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString(locale()) : iso || '';
}

function repeatText(value) {
  const [unit, n] = (value || '').split(':');
  return recurrenceHow(unit, parseInt(n, 10) || 1);
}

/** What happened, without the actor: "changed status from To Do to Done". */
export function describeActivity({ kind, actor, old_value: o, new_value: n }, fmtDay = formatDay) {
  switch (kind) {
    case 'created':
      return t('created the task');
    case 'title':
      return t('renamed it from “{old}” to “{new}”', { old: o, new: n });
    case 'description':
      return t('edited the description');
    case 'status':
      if (n === 'done') return t('completed it');
      if (o === 'done') return t('reopened it ({status})', { status: statusName(n) });
      return t('changed status from {old} to {new}', { old: statusName(o), new: statusName(n) });
    case 'priority':
      return t('changed priority from {old} to {new}', { old: priorityName(o), new: priorityName(n) });
    case 'deadline':
      if (!n) return t('removed the deadline');
      if (!o) return t('set the deadline to {date}', { date: fmtDay(n) });
      return t('moved the deadline from {old} to {new}', { old: fmtDay(o), new: fmtDay(n) });
    case 'assignee':
      if (!n) return o ? t('unassigned {name}', { name: o }) : t('unassigned it');
      if (n === actor) return o ? t('took it over from {name}', { name: o }) : t('took it on');
      if (!o) return t('assigned it to {name}', { name: n });
      return t('reassigned it from {old} to {new}', { old: o, new: n });
    case 'project':
      return t('moved it from {old} to {new}', { old: o || t('No project'), new: n || t('No project') });
    case 'labels':
      if (!o) return t('labeled it {labels}', { labels: n });
      if (!n) return t('removed the labels ({labels})', { labels: o });
      return t('changed labels from {old} to {new}', { old: o, new: n });
    case 'blocked_by':
      if (!o) return t('made it wait for {tasks}', { tasks: n });
      if (!n) return t('removed what it waited for ({tasks})', { tasks: o });
      return t('changed what it waits for from {old} to {new}', { old: o, new: n });
    case 'recurrence':
      return n ? t('made it repeat {how}', { how: repeatText(n) }) : t('stopped repeating it');
    case 'next_created':
      return n ? t('created the next occurrence (due {date})', { date: fmtDay(n) }) : t('created the next occurrence');
    case 'repeat_of':
      return t('created it as the next occurrence of a repeating task');
    default:
      return kind;
  }
}
