// CSV export of all tasks. Semicolon-separated with a UTF-8 BOM so Excel
// (including German-locale Excel) opens it with columns and umlauts intact.
import { t } from './i18n';
import { statusName, priorityName } from './names';

const SEP = ';';

const cell = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const day = (iso) => (iso ? iso.slice(0, 10) : '');

export const csvColumns = () => [
  t('ID'), t('Project'), t('Category'), t('Task'), t('Parent task'), t('Status'), t('Priority'),
  t('Assignee'), t('Deadline'), t('Created'), t('Completed'), t('Description'), t('Labels'),
];

export function tasksToCsv(tasks, projectIndex, users, labels = []) {
  const labelName = new Map(labels.map((l) => [l.id, l.name]));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const userName = new Map(users.map((u) => [u.id, u.username]));

  // Subtasks without their own project belong to their parent's project.
  const projectOf = (t) => {
    for (let cur = t; cur; cur = byId.get(cur.parent_task_id)) {
      if (cur.project_id != null) return cur.project_id;
    }
    return null;
  };

  const rows = [...tasks]
    .sort((a, b) => a.id - b.id)
    .map((t) => {
      const pid = projectOf(t);
      const top = pid != null ? projectIndex.topOf(pid) : null;
      const category = top && pid !== top.id ? projectIndex.byId.get(pid)?.name : '';
      return [
        t.id,
        top ? top.name : '',
        category,
        t.title,
        t.parent_task_id != null ? byId.get(t.parent_task_id)?.title ?? '' : '',
        statusName(t.status),
        priorityName(t.priority),
        t.assignee_id != null ? userName.get(t.assignee_id) ?? '' : '',
        day(t.deadline),
        day(t.created_at),
        day(t.completed_at),
        t.description,
        (t.label_ids || []).map((id) => labelName.get(id)).filter(Boolean).sort().join(', '),
      ];
    });

  return '﻿' + [csvColumns(), ...rows].map((r) => r.map(cell).join(SEP)).join('\r\n') + '\r\n';
}
