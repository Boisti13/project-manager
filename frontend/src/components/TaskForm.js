import React, { useState, useEffect, useMemo } from 'react';
import LabelPicker from './LabelPicker';
import DependencyPicker from './DependencyPicker';
import { parseBulk, countNested } from '../bulkParse';
import '../styles/TaskForm.css';
import { t, tn } from '../i18n';
import { STATUSES, statusName } from '../names';

const bulkPlaceholder = () =>
  t(
    'One task per line. Indent (Tab) for subtasks:\n\nOrder parts\n  Antenna modules\n  Cables\nWrite setup guide\n- [x] Flash firmware   (bullets and [x] checkboxes work too)'
  );

// "day" / "days" etc. after the repeat interval.
function unitWord(unit, n) {
  switch (unit) {
    case 'day':
      return tn(n, 'day', 'days');
    case 'week':
      return tn(n, 'week', 'weeks');
    case 'month':
      return tn(n, 'month', 'months');
    case 'year':
      return tn(n, 'year', 'years');
    default:
      return unit;
  }
}

function BulkPreview({ items }) {
  return (
    <ul className="bulk-preview-list">
      {items.map((item, i) => (
        <li key={i}>
          <span className={item.status === 'done' ? 'bulk-done' : ''}>{item.title}</span>
          {item.children.length > 0 && <BulkPreview items={item.children} />}
        </li>
      ))}
    </ul>
  );
}

// Tab / Shift+Tab indent and outdent the current line instead of leaving the
// box. The edit is made on the element itself (setRangeText keeps the cursor
// in place synchronously) and then synced to state, so a key typed right
// after Tab can't land before the cursor has been restored.
function handleIndentKeys(e, setValue) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const el = e.target;
  const { selectionStart: start, selectionEnd: end } = el;
  const lineStart = el.value.lastIndexOf('\n', start - 1) + 1;
  if (e.shiftKey) {
    const remove = el.value.slice(lineStart, lineStart + 2).match(/^ {1,2}|^\t/)?.[0].length || 0;
    if (!remove) return;
    el.setRangeText('', lineStart, lineStart + remove);
    el.setSelectionRange(Math.max(lineStart, start - remove), Math.max(lineStart, end - remove));
  } else {
    el.setRangeText('  ', lineStart, lineStart);
    el.setSelectionRange(start + 2, end + 2);
  }
  setValue(el.value);
}

function TaskForm({
  task,
  parentTask,
  defaultProjectId = null,
  projectIndex,
  users,
  labels = [],
  onLabelCreated,
  allTasks = [],
  onSubmit,
  onBulkSubmit,
  onCancel,
}) {
  // 'single' | 'bulk'; bulk only when creating, not editing.
  const [mode, setMode] = useState('single');
  const [bulkText, setBulkText] = useState('');
  const bulk = useMemo(() => parseBulk(bulkText), [bulkText]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 0,
    deadline: '',
    project_id: parentTask ? parentTask.project_id || null : defaultProjectId,
    assignee_id: null,
    parent_task_id: parentTask ? parentTask.id : null,
    recurrence_unit: null,
    recurrence_interval: 1,
    label_ids: [],
    blocked_by_ids: [],
  });

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'todo',
        priority: task.priority || 0,
        deadline: task.deadline ? task.deadline.split('T')[0] : '',
        project_id: task.project_id || null,
        assignee_id: task.assignee_id || null,
        recurrence_unit: task.recurrence_unit || null,
        recurrence_interval: task.recurrence_interval || 1,
        parent_task_id: task.parent_task_id || null,
        label_ids: task.label_ids || [],
        blocked_by_ids: task.blocked_by_ids || [],
      });
    }
  }, [task]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'recurrence_unit'
        ? value || null
        : name === 'recurrence_interval'
        ? Math.max(1, parseInt(value, 10) || 1)
        : name === 'priority' || name === 'project_id' || name === 'assignee_id'
        ? (value === '' ? null : parseInt(value, 10))
        : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const deadline = formData.deadline ? formData.deadline : null;
    if (mode === 'bulk') {
      if (bulk.count === 0) return;
      onBulkSubmit({
        items: bulk.items,
        project_id: formData.project_id,
        parent_task_id: formData.parent_task_id,
        status: formData.status,
        priority: formData.priority || 0,
        deadline,
        assignee_id: formData.assignee_id,
        label_ids: formData.label_ids,
      });
      return;
    }
    onSubmit({
      ...formData,
      deadline,
      recurrence_interval: formData.recurrence_unit ? formData.recurrence_interval : null,
    });
  };

  const nested = countNested(bulk.items);

  // Subtasks without their own project belong to their parent's.
  const effectiveProject = formData.project_id ?? parentTask?.project_id ?? null;
  const privateProject = effectiveProject != null && projectIndex.isPrivate(effectiveProject);
  const assignable = projectIndex.assignableUsers(effectiveProject, users);

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      {parentTask && (
        <div className="subtask-of-banner">
          {mode === 'bulk' ? t('Subtasks of') : t('Subtask of')}: <strong>{parentTask.title}</strong>
        </div>
      )}

      {!task && onBulkSubmit && (
        <div className="form-mode" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'single'}
            className={mode === 'single' ? 'active' : ''}
            onClick={() => setMode('single')}
          >
            {t('One task')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'bulk'}
            className={mode === 'bulk' ? 'active' : ''}
            onClick={() => setMode('bulk')}
          >
            {t('Several (one per line)')}
          </button>
        </div>
      )}

      {mode === 'single' ? (
        <>
          <div className="form-group">
            <label>{t('Title *')}</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder={t('Enter task title')}
            />
          </div>

          <div className="form-group">
            <label>{t('Description')}</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder={t('Task description')}
              rows="3"
            />
          </div>
        </>
      ) : (
        <div className="bulk-entry">
          <div className="form-group">
            <label htmlFor="bulk-text">{t('Tasks')}</label>
            <textarea
              id="bulk-text"
              className="bulk-textarea"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              onKeyDown={(e) => handleIndentKeys(e, setBulkText)}
              placeholder={bulkPlaceholder()}
              rows="9"
              autoFocus
              spellCheck
            />
            <small className="bulk-hint">
              {t('Indent with Tab (Shift+Tab to outdent) or two spaces. The fields below apply to every task.')}
            </small>
          </div>
          <div className="bulk-preview" aria-live="polite">
            <div className="bulk-preview-head">
              {bulk.count === 0
                ? t('Preview')
                : tn(bulk.count, 'one task', '{n} tasks') +
                  (nested ? ' ' + tn(nested, '(one as a subtask)', '({n} as subtasks)') : '')}
            </div>
            {bulk.count === 0 ? (
              <p className="bulk-empty">{t('Type or paste a list on the left.')}</p>
            ) : (
              <BulkPreview items={bulk.items} />
            )}
          </div>
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label>{t('Status')}</label>
          <select name="status" value={formData.status} onChange={handleChange}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusName(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>{t('Priority')}</label>
          <input
            type="number"
            name="priority"
            value={formData.priority}
            onChange={handleChange}
            min="0"
            max="10"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t('Deadline')}</label>
          <input
            type="date"
            name="deadline"
            value={formData.deadline}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>{t('Project')}</label>
          <select name="project_id" value={formData.project_id || ''} onChange={handleChange}>
            <option value="">{t('None')}</option>
            {projectIndex.topLevel.map((p) => {
              const categories = projectIndex.categoriesOf(p.id);
              if (categories.length === 0) {
                return (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                );
              }
              return (
                <optgroup key={p.id} label={p.name}>
                  <option value={p.id}>{t('{name} (no category)', { name: p.name })}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
      </div>

      {mode === 'single' && (
        <div className="form-group">
          <label htmlFor="repeat-unit">{t('Repeat')}</label>
          <div className="repeat-row">
            <select
              id="repeat-unit"
              name="recurrence_unit"
              value={formData.recurrence_unit || ''}
              onChange={handleChange}
            >
              <option value="">{t("Doesn't repeat")}</option>
              <option value="day">{t('Every day')}</option>
              <option value="week">{t('Every week')}</option>
              <option value="month">{t('Every month')}</option>
              <option value="year">{t('Every year')}</option>
            </select>
            {formData.recurrence_unit && (
              <label className="repeat-interval">
                {t('every')}
                <input
                  type="number"
                  name="recurrence_interval"
                  min="1"
                  max="365"
                  value={formData.recurrence_interval}
                  onChange={handleChange}
                  aria-label={t('Repeat interval')}
                />
                {unitWord(formData.recurrence_unit, formData.recurrence_interval)}
              </label>
            )}
          </div>
          {formData.recurrence_unit && (
            <small className="repeat-hint">
              {formData.deadline
                ? t('Ticking it off creates the next one with the deadline moved forward; subtasks come along as a fresh checklist.')
                : t('Ticking it off creates the next one, due one interval after today; subtasks come along as a fresh checklist.')}
            </small>
          )}
        </div>
      )}

      <div className="form-group">
        <label>{t('Labels')}</label>
        <LabelPicker
          labels={labels}
          value={formData.label_ids}
          onChange={(ids) => setFormData((prev) => ({ ...prev, label_ids: ids }))}
          onCreated={onLabelCreated}
        />
      </div>

      {mode === 'single' && (
        <div className="form-group">
          <label>{t('Waits for')}</label>
          <DependencyPicker
            tasks={allTasks}
            task={task}
            value={formData.blocked_by_ids}
            onChange={(ids) => setFormData((prev) => ({ ...prev, blocked_by_ids: ids }))}
            projectIndex={projectIndex}
          />
          <small className="repeat-hint">
            {t('Shown as ⏳ waiting until these are done; then the assignee is notified that it can start.')}
          </small>
        </div>
      )}

      <div className="form-group">
        <label>{t('Assign To')}</label>
        <select name="assignee_id" value={formData.assignee_id || ''} onChange={handleChange}>
          <option value="">{t('Unassigned')}</option>
          {assignable.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
            </option>
          ))}
          {formData.assignee_id && !assignable.some((u) => u.id === formData.assignee_id) && (
            <option value={formData.assignee_id} disabled>
              {t('{name} (not a member)', { name: users.find((u) => u.id === formData.assignee_id)?.username || t('Unknown') })}
            </option>
          )}
        </select>
        {privateProject && (
          <small className="repeat-hint">{t('🔒 Private project: only its members and admins can be assigned.')}</small>
        )}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={mode === 'bulk' && bulk.count === 0}>
          {task
            ? t('Update Task')
            : mode === 'bulk'
            ? bulk.count
              ? tn(bulk.count, 'Create one task', 'Create {n} tasks')
              : t('Create tasks')
            : t('Create Task')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}

export default TaskForm;
