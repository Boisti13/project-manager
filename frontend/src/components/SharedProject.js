import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Markdown from './Markdown';
import LabelChips from './LabelChips';
import { formatEstimate } from '../estimate';
import { statusName, priorityName } from '../names';
import { t } from '../i18n';
import '../styles/TaskItem.css';
import '../styles/Shared.css';
import { dateRangeText } from './TaskItem';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id;
const isOverdue = (task) => task.status !== 'done' && task.deadline && new Date(task.deadline) < new Date();

// /share/<token>: a project's tasks, read-only, for someone without an
// account (the link is made under Projects → share). No login, no changes.
function SharedProject() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openDone, setOpenDone] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/share/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? t('This link doesn’t work (anymore). Ask for a new one.') : `HTTP ${res.status}`);
        return res.json();
      })
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const tree = useMemo(() => {
    if (!data) return null;
    const ids = new Set(data.tasks.map((x) => x.id));
    const children = new Map();
    const roots = [];
    for (const task of data.tasks) {
      if (task.parent_task_id != null && ids.has(task.parent_task_id)) {
        if (!children.has(task.parent_task_id)) children.set(task.parent_task_id, []);
        children.get(task.parent_task_id).push(task);
      } else roots.push(task);
    }
    for (const list of children.values()) list.sort(byOrder);
    roots.sort(byOrder);
    const sections = [
      { id: data.id, name: null, description: null },
      ...data.categories,
    ].map((section) => {
      const own = roots.filter((r) => (r.project_id ?? data.id) === section.id);
      return { ...section, open: own.filter((r) => r.status !== 'done'), done: own.filter((r) => r.status === 'done') };
    });
    const done = data.tasks.filter((x) => x.status === 'done').length;
    return { children: (task) => children.get(task.id) || [], sections, done, total: data.tasks.length };
  }, [data]);

  if (error) {
    return (
      <div className="container shared">
        <div className="error-message">{error}</div>
      </div>
    );
  }
  if (!data) return <div className="container shared"><p>{t('Loading…')}</p></div>;

  const percent = tree.total ? Math.round((tree.done * 100) / tree.total) : 0;

  const renderTask = (task) => {
    const kids = tree.children(task);
    const kidsDone = kids.filter((k) => k.status === 'done').length;
    return (
      <li key={task.id} className="shared-task">
        <div className="shared-task-row">
          <span className={`shared-check ${task.status === 'done' ? 'done' : ''}`} aria-hidden="true">
            {task.status === 'done' ? '☑' : '☐'}
          </span>
          <span className={`shared-title ${task.status === 'done' ? 'task-title-done' : ''}`}>{task.title}</span>
          <LabelChips labels={task.labels.map((l) => ({ ...l, id: l.name }))} small />
          <span className="shared-badges">
            {kids.length > 0 && (
              <span className={`task-progress ${kidsDone === kids.length ? 'complete' : ''}`}>
                {kidsDone}/{kids.length}
              </span>
            )}
            {task.priority > 0 && (
              <span className="task-priority" data-priority={task.priority}>
                {priorityName(task.priority)}
              </span>
            )}
            {task.estimate_minutes > 0 && <span className="task-estimate">⏱ {formatEstimate(task.estimate_minutes)}</span>}
            {(task.deadline || task.start_date) && (
              <span className={`task-deadline ${isOverdue(task) ? 'overdue' : ''}`}>{dateRangeText(task)}</span>
            )}
            <span className={`task-status-badge status-${task.status}`}>{statusName(task.status)}</span>
          </span>
        </div>
        {task.description && <Markdown text={task.description} className="shared-description" />}
        {kids.length > 0 && <ul className="shared-subtasks">{kids.map(renderTask)}</ul>}
      </li>
    );
  };

  return (
    <div className="container shared" style={{ '--project-color': data.color || '#9e9e9e' }}>
      <div className="shared-head">
        <p className="shared-kicker">{t('Shared project · read-only')}</p>
        <h1>
          <span className="project-swatch" />
          {data.name}
          {data.archived && <span className="shared-archived">{t('archived')}</span>}
        </h1>
        {data.description && <Markdown text={data.description} className="shared-intro" />}
        <div className="shared-progress" title={t('{done} of {total} tasks done', { done: tree.done, total: tree.total })}>
          <div className="shared-progress-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
          <span>{t('{done} of {total} tasks done', { done: tree.done, total: tree.total })}</span>
        </div>
      </div>

      {tree.sections.map((section) => {
        if (section.name && !section.open.length && !section.done.length) return null;
        const doneOpen = openDone.has(section.id);
        return (
          <section key={section.id} className="shared-section">
            {section.name && <h2 className="category-name">{section.name}</h2>}
            {section.description && <p className="shared-section-desc">{section.description}</p>}
            {section.open.length > 0 && <ul className="shared-tasks">{section.open.map(renderTask)}</ul>}
            {!section.name && !section.open.length && !section.done.length && tree.sections.length === 1 && (
              <p className="category-empty">{t('No tasks')}</p>
            )}
            {section.done.length > 0 && (
              <div className="completed-group">
                <button
                  className="completed-toggle"
                  aria-expanded={doneOpen}
                  onClick={() =>
                    setOpenDone((prev) => {
                      const next = new Set(prev);
                      if (next.has(section.id)) next.delete(section.id);
                      else next.add(section.id);
                      return next;
                    })
                  }
                >
                  <span className="project-group-caret">{doneOpen ? '▼' : '▶'}</span>
                  {t('✓ Completed ({n})', { n: section.done.length })}
                </button>
                {doneOpen && <ul className="shared-tasks">{section.done.map(renderTask)}</ul>}
              </div>
            )}
          </section>
        );
      })}

      <p className="shared-foot">{t('Read-only view from Project Manager. It shows the current state each time the page is opened.')}</p>
    </div>
  );
}

export default SharedProject;
