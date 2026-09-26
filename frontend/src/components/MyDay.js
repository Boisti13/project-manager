import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authFetch, useAuth } from '../context/AuthContext';
import { buildProjectIndex } from '../projects';
import { buildLabelIndex } from '../labels';
import { buildDependencyIndex } from '../dependencies';
import { buildMyDay, recentNotifications, greeting } from '../myday';
import { timeAgo } from './TaskComments';
import { formatDay, isOverdue } from './TaskBoard';
import LabelChips from './LabelChips';
import '../styles/MyDay.css';
import { t, locale } from '../i18n';
import { priorityName } from '../names';
import { notificationExcerpt } from './NotificationBell';

export const START_KEY = 'pm.startWithMyDay';
const UNASSIGNED_KEY = 'pm.myDayUnassigned';


const readFlag = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
};
const writeFlag = (key, on) => {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* per-browser convenience only */
  }
};

// Start page: what needs you today.
function MyDay() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [includeUnassigned, setIncludeUnassigned] = useState(() => readFlag(UNASSIGNED_KEY, true));
  const [startHere, setStartHere] = useState(() => readFlag(START_KEY, false));

  const load = useCallback(async () => {
    try {
      const get = async (url) => {
        const r = await authFetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      };
      const [tasks, projects, labels, notes] = await Promise.all([
        get('/api/tasks/'),
        get('/api/projects/'),
        get('/api/labels/'),
        get('/api/notifications/?limit=100'),
      ]);
      setData({ tasks, projects, labels, notes: notes.items });
      setError(null);
    } catch (err) {
      setError(t('Could not load your day: {error}', { error: err.message }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const projectIndex = useMemo(() => buildProjectIndex(data?.projects || []), [data]);
  const labelIndex = useMemo(() => buildLabelIndex(data?.labels || []), [data]);
  const depIndex = useMemo(() => buildDependencyIndex(data?.tasks || []), [data]);
  const day = useMemo(
    () => buildMyDay(data?.tasks || [], { userId: currentUser?.id, includeUnassigned }),
    [data, currentUser, includeUnassigned]
  );
  const taskById = useMemo(() => new Map((data?.tasks || []).map((t) => [t.id, t])), [data]);

  const complete = async (task) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, status: 'done' } : t)) }));
    const res = await authFetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    if (!res.ok) setError(t('Could not complete the task.'));
    await load(); // repeating tasks, unblocked tasks
  };

  const open = (taskId, comments = false) => navigate(`/?task=${taskId}${comments ? '&comments=1' : ''}`);

  const row = (task) => {
    const blockers = depIndex.openBlockersOf(task);
    const parent = task.parent_task_id != null ? taskById.get(task.parent_task_id) : null;
    return (
      <li key={task.id} className="myday-task" style={{ '--project-color': projectIndex.colorOf(task.project_id ?? parent?.project_id) }}>
        <input
          type="checkbox"
          className="task-done-checkbox"
          checked={false}
          onChange={() => complete(task)}
          aria-label={t('Mark “{title}” done', { title: task.title })}
          title={t('Mark done')}
        />
        <span className="myday-main">
          <button className="myday-title" onClick={() => open(task.id)}>
            {task.title}
          </button>
          <span className="myday-meta">
            {(task.project_id ?? parent?.project_id) != null && (
              <span className="myday-project">{projectIndex.labelOf(task.project_id ?? parent?.project_id)}</span>
            )}
            {parent && <span className="myday-parent">{t('in “{title}”', { title: parent.title })}</span>}
            <LabelChips labels={labelIndex.of(task)} small />
          </span>
        </span>
        <span className="myday-badges">
          {task.priority > 0 && (
            <span className="task-priority" data-priority={task.priority}>
              {priorityName(task.priority)}
            </span>
          )}
          {blockers.length > 0 && (
            <span className="task-waiting" title={t('Waiting for: {tasks}', { tasks: blockers.map((b) => b.title).join(', ') })}>
              ⏳
            </span>
          )}
          {task.deadline && <span className={`task-deadline ${isOverdue(task) ? 'overdue' : ''}`}>{formatDay(task.deadline)}</span>}
        </span>
      </li>
    );
  };

  const section = (key, title, list, empty, tone = '') => (
    <section className={`myday-section ${tone}`} key={key}>
      <h2>
        {title} <span className="project-group-count">{list.length}</span>
      </h2>
      {list.length === 0 ? <p className="myday-empty">{empty}</p> : <ul>{list.map(row)}</ul>}
    </section>
  );

  if (error) return <div className="container"><div className="error-message">{error}</div></div>;
  if (!data) return <div className="container"><p>{t('Loading your day…')}</p></div>;

  const assigned = recentNotifications(data.notes, 'assigned').filter((n) => taskById.get(n.task_id)?.status !== 'done');
  const comments = recentNotifications(data.notes, 'comment').slice(0, 8);
  const now = new Date();
  const counts = [
    ['overdue', day.overdue.length, t('overdue'), 'danger'],
    ['today', day.dueToday.length, t('due today'), 'warn'],
    ['week', day.thisWeek.length, t('this week'), ''],
    ['progress', day.inProgress.length, t('in progress'), 'info'],
  ];

  return (
    <div className="container myday">
      <div className="task-list-header">
        <div className="header-left myday-heading">
          <h1>
            {greeting(now)}, {currentUser?.username}
          </h1>
          <span className="task-count">
            {now.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <Link to="/" className="btn btn-secondary">
          {t('All tasks →')}
        </Link>
      </div>

      <div className="myday-counts">
        {counts.map(([key, n, label, tone]) => (
          <a key={key} href={`#myday-${key}`} className={`myday-count ${n ? tone : ''}`}>
            <strong>{n}</strong>
            <span>{label}</span>
          </a>
        ))}
      </div>

      <div className="myday-options">
        <label>
          <input
            type="checkbox"
            checked={includeUnassigned}
            onChange={(e) => {
              setIncludeUnassigned(e.target.checked);
              writeFlag(UNASSIGNED_KEY, e.target.checked);
            }}
          />
          {t('Include unassigned tasks')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={startHere}
            onChange={(e) => {
              setStartHere(e.target.checked);
              writeFlag(START_KEY, e.target.checked);
            }}
          />
          {t('Open My day when I start the app')}
        </label>
      </div>

      <div className="myday-grid">
        <div id="myday-overdue">{section('overdue', t('⚠ Overdue'), day.overdue, t('Nothing overdue. 🎉'), 'danger')}</div>
        <div id="myday-today">{section('today', t('Due today'), day.dueToday, t('Nothing due today.'), 'warn')}</div>
        <div id="myday-week">{section('week', t('This week'), day.thisWeek, t('Nothing due in the next 7 days.'))}</div>
        <div id="myday-progress">
          {section('progress', t('In progress'), day.inProgress, t('Nothing in progress.'), 'info')}
        </div>
        {day.waiting.length > 0 && section('waiting', t('⏳ Waiting for others'), day.waiting, '')}

        <section className="myday-section">
          <h2>
            {t('Recently assigned to you')} <span className="project-group-count">{assigned.length}</span>
          </h2>
          {assigned.length === 0 ? (
            <p className="myday-empty">{t('No new assignments in the last 7 days.')}</p>
          ) : (
            <ul>
              {assigned.map((n) => (
                <li key={n.id} className="myday-note">
                  <button className="myday-title" onClick={() => open(n.task_id)}>
                    {n.task_title}
                  </button>
                  <span className="myday-meta">
                    {t('by {name}', { name: n.actor || t('someone') })} · {timeAgo(n.created_at)}
                    {n.excerpt ? ` · ${notificationExcerpt(n)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="myday-section">
          <h2>
            {t('Recent comments')} <span className="project-group-count">{comments.length}</span>
          </h2>
          {comments.length === 0 ? (
            <p className="myday-empty">{t('No new comments in the last 7 days.')}</p>
          ) : (
            <ul>
              {comments.map((n) => (
                <li key={n.id} className="myday-note">
                  <button className="myday-title" onClick={() => open(n.task_id, true)}>
                    {n.task_title}
                  </button>
                  <span className="myday-meta">
                    {n.actor || t('Someone')} · {timeAgo(n.created_at)}
                  </span>
                  {n.excerpt && <span className="myday-excerpt">“{n.excerpt}”</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default MyDay;
