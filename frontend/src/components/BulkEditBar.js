import React from 'react';
import TrashIcon from './TrashIcon';
import '../styles/BulkEdit.css';
import { t, tn } from '../i18n';
import { STATUSES, statusName, PRIORITIES, priorityName } from '../names';

/**
 * The bar above the list in select mode: what's selected, and changes for
 * all of it. Each list applies as soon as something is picked, then resets.
 * onApply({ field, value }): status | priority | project_id | assignee_id |
 * deadline | add_label | remove_label.
 */
function BulkEditBar({ count, onSelectAll, onClear, onExit, onApply, onDelete, projectIndex, users, labels }) {
  const pick = (field) => (e) => {
    const { value } = e.target;
    e.target.value = '';
    if (value === '') return;
    onApply({ field, value });
  };
  const none = count === 0;

  return (
    <div className="bulk-bar" role="toolbar" aria-label={t('Change the selected tasks')}>
      <div className="bulk-bar-head">
        <strong>{tn(count, 'one selected', '{n} selected')}</strong>
        <button className="link-btn" onClick={onSelectAll}>
          {t('Select all shown')}
        </button>
        {!none && (
          <button className="link-btn" onClick={onClear}>
            {t('Clear')}
          </button>
        )}
        <button className="btn btn-secondary btn-small bulk-bar-done" onClick={onExit}>
          {t('Stop selecting')}
        </button>
      </div>
      <div className="bulk-bar-actions">
        <select defaultValue="" onChange={pick('status')} disabled={none} aria-label={t('Set status')}>
          <option value="">{t('Status…')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusName(s)}
            </option>
          ))}
        </select>
        <select defaultValue="" onChange={pick('priority')} disabled={none} aria-label={t('Set priority')}>
          <option value="">{t('Priority…')}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityName(p)}
            </option>
          ))}
        </select>
        <select defaultValue="" onChange={pick('project_id')} disabled={none} aria-label={t('Move to project')}>
          <option value="">{t('Project…')}</option>
          <option value="none">{t('No project')}</option>
          {projectIndex.topLevel.map((p) => [
            <option key={p.id} value={p.id}>
              {p.name}
            </option>,
            ...projectIndex.categoriesOf(p.id).map((c) => (
              <option key={c.id} value={c.id}>
                {'   └ '}
                {c.name}
              </option>
            )),
          ])}
        </select>
        <select defaultValue="" onChange={pick('assignee_id')} disabled={none} aria-label={t('Assign to')}>
          <option value="">{t('Assignee…')}</option>
          <option value="none">{t('Unassigned')}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
            </option>
          ))}
        </select>
        <label className="bulk-bar-date">
          <span>{t('Deadline')}</span>
          <input
            type="date"
            defaultValue=""
            disabled={none}
            onChange={(e) => {
              if (e.target.value) onApply({ field: 'deadline', value: e.target.value });
              e.target.value = '';
            }}
            aria-label={t('Set deadline')}
          />
        </label>
        <button
          className="btn btn-secondary btn-small"
          disabled={none}
          onClick={() => onApply({ field: 'deadline', value: null })}
          title={t('Remove the deadline')}
        >
          {t('No deadline')}
        </button>
        {labels.length > 0 && (
          <>
            <select defaultValue="" onChange={pick('add_label')} disabled={none} aria-label={t('Add label')}>
              <option value="">{t('+ Label…')}</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select defaultValue="" onChange={pick('remove_label')} disabled={none} aria-label={t('Remove label')}>
              <option value="">{t('− Label…')}</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          className="btn btn-secondary btn-small btn-danger bulk-bar-delete"
          disabled={none}
          onClick={onDelete}
          title={t('Delete the selected tasks')}
        >
          <TrashIcon size={14} /> {t('Delete')}
        </button>
      </div>
    </div>
  );
}

export default BulkEditBar;
