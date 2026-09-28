import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch, useAuth } from '../context/AuthContext';
import { buildProjectIndex, withoutArchived } from '../projects';
import { weekStart, addDays, buildReview, deadlineDay } from '../review';
import { childIndex, formatEstimate } from '../estimate';
import { copyText } from '../clipboard';
import { parseServerDate } from '../taskFilters';
import '../styles/MyDay.css';
import '../styles/Review.css';
import { t, tn, locale } from '../i18n';
import { useSyncRefresh } from '../desktop/useSyncRefresh';

const MINE_KEY = 'pm.reviewMine';

const readMine = () => {
  try {
    return localStorage.getItem(MINE_KEY) === '1';
  } catch {
    return false;
  }
};

const dayText = (date, opts = {}) => date.toLocaleDateString(locale(), { day: 'numeric', month: 'short', ...opts });

// Weekly review: done this week, overdue, due next week, open work per project.
function WeeklyReview() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [mine, setMine] = useState(readMine);
  const [copied, setCopied] = useState(null); // null | 'ok' | 'failed'

  const load = useCallback(async () => {
    try {
      const get = async (url) => {
        const r = await authFetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      };
      const [tasks, projects] = await Promise.all([get('/api/tasks/'), get('/api/projects/')]);
      setData({ tasks, projects });
      setError(null);
    } catch (err) {
      setError(t('Could not load the review: {error}', { error: err.message }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useSyncRefresh(load);

  const projectIndex = useMemo(() => buildProjectIndex(data?.projects || []), [data]);
  const byId = useMemo(() => new Map((data?.tasks || []).map((x) => [x.id, x])), [data]);
  // Subtasks without their own project belong to their parent's.
  const projectOf = useCallback(
    (task) => {
      for (let cur = task; cur; cur = byId.get(cur.parent_task_id)) {
        if (cur.project_id != null) return projectIndex.topOf(cur.project_id)?.id ?? null;
      }
      return null;
    },
    [byId, projectIndex]
  );
  const activeIds = useMemo(
    () => new Set(withoutArchived(data?.tasks || [], projectIndex).map((x) => x.id)),
    [data, projectIndex]
  );
  const review = useMemo(
    () =>
      data &&
      // Done tasks count wherever they are; open ones only in active projects.
      buildReview(data.tasks.filter((x) => x.status === 'done' || activeIds.has(x.id)), {
        start,
        mine,
        userId: currentUser?.id,
        projectOf,
        childrenOf: childIndex(data.tasks),
      }),
    [data, start, mine, currentUser, projectOf, activeIds]
  );

  const setWeek = (next) => {
    setStart(next);
    setCopied(null);
  };
  const toggleMine = (value) => {
    setMine(value);
    setCopied(null);
    try {
      localStorage.setItem(MINE_KEY, value ? '1' : '0');
    } catch {
      /* per-browser convenience only */
    }
  };

  if (error) return <div className="container"><div className="error-message">{error}</div></div>;
  if (!review) return <div className="container"><p>{t('Loading the review…')}</p></div>;

  const end = addDays(start, 6);
  const weekLabel = `${dayText(start)} – ${dayText(end, { year: 'numeric' })}`;
  const thisWeek = start.getTime() === weekStart(new Date()).getTime();
  const projectName = (id) => (id == null ? t('No project') : projectIndex.byId.get(id)?.name || '?');
  const where = (task) => {
    const pid = projectOf(task);
    const parent = task.parent_task_id != null ? byId.get(task.parent_task_id) : null;
    return [pid != null ? projectName(pid) : null, parent ? t('in “{title}”', { title: parent.title }) : null]
      .filter(Boolean)
      .join(' · ');
  };
  const projects = [...review.projects]
    .filter((r) => r.done || r.open)
    .sort((a, b) => (a.projectId == null) - (b.projectId == null) || projectName(a.projectId).localeCompare(projectName(b.projectId)));
  const totalMinutes = projects.reduce((sum, r) => sum + r.minutes, 0);

  const open = (task) => navigate(`/?task=${task.id}`);

  const list = (tasks, dateOf) => (
    <ul>
      {tasks.map((task) => (
        <li key={task.id} className="myday-task review-task">
          <span className="myday-main">
            <button className="myday-title" onClick={() => open(task)}>
              {task.title}
            </button>
            <span className="myday-meta">{where(task)}</span>
          </span>
          <span className="myday-badges">
            <span className="task-deadline">{dateOf(task)}</span>
          </span>
        </li>
      ))}
    </ul>
  );

  const section = (key, title, tasks, empty, dateOf, tone = '') => (
    <section className={`myday-section ${tone}`} key={key}>
      <h2>
        {title} <span className="project-group-count">{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? <p className="myday-empty">{empty}</p> : list(tasks, dateOf)}
    </section>
  );

  const doneOn = (task) => dayText(parseServerDate(task.completed_at), { weekday: 'short' });
  const dueOn = (task) => dayText(deadlineDay(task.deadline), { weekday: 'short' });

  // Plain text for a status mail.
  const asText = () => {
    const lines = [`${t('Weekly review')} ${weekLabel}${mine ? ` (${t('only mine')})` : ''}`, ''];
    const block = (title, tasks, dateOf) => {
      lines.push(`${title} (${tasks.length})`);
      tasks.forEach((task) => {
        const w = where(task);
        lines.push(`- ${task.title}${w ? ` — ${w}` : ''} (${dateOf(task)})`);
      });
      lines.push('');
    };
    block(t('Done'), review.done, doneOn);
    block(t('Overdue'), review.overdue, dueOn);
    block(t('Due next week'), review.dueNext, dueOn);
    lines.push(t('Open work'));
    projects.forEach((r) => {
      const parts = [tn(r.open, 'one open', '{n} open')];
      if (r.overdue) parts.push(tn(r.overdue, 'one overdue', '{n} overdue'));
      if (r.minutes) parts.push(`⏱ ${formatEstimate(r.minutes)}`);
      lines.push(`- ${projectName(r.projectId)}: ${parts.join(', ')}`);
    });
    return lines.join('\n') + '\n';
  };

  const copy = async () => setCopied((await copyText(asText())) ? 'ok' : 'failed');

  const counts = [
    ['done', review.done.length, t('done'), 'info'],
    ['created', review.created, t('new'), ''],
    ['overdue', review.overdue.length, t('overdue'), 'danger'],
    ['next', review.dueNext.length, t('due next week'), 'warn'],
  ];

  return (
    <div className="container myday review">
      <div className="task-list-header">
        <div className="header-left myday-heading">
          <h1>{t('Weekly review')}</h1>
          <span className="task-count">{weekLabel}</span>
        </div>
        <div className="review-actions no-print">
          <button className="btn btn-secondary btn-small" onClick={copy}>
            {copied === 'ok' ? t('Copied ✓') : t('Copy as text')}
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => window.print()}>
            {t('Print')}
          </button>
        </div>
      </div>
      {copied === 'failed' && <p className="error-message no-print">{t('Copying didn’t work in this browser.')}</p>}

      <div className="review-controls no-print">
        <div className="review-week" role="group" aria-label={t('Week')}>
          <button className="btn btn-secondary btn-small" onClick={() => setWeek(addDays(start, -7))} aria-label={t('Previous week')}>
            ‹
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setWeek(weekStart(new Date()))} disabled={thisWeek}>
            {t('This week')}
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => setWeek(addDays(start, 7))} aria-label={t('Next week')}>
            ›
          </button>
        </div>
        <div className="view-switch" role="group" aria-label={t('Whose tasks')}>
          <button className={!mine ? 'active' : ''} aria-pressed={!mine} onClick={() => toggleMine(false)}>
            {t('Everyone')}
          </button>
          <button className={mine ? 'active' : ''} aria-pressed={mine} onClick={() => toggleMine(true)}>
            {t('Only mine')}
          </button>
        </div>
      </div>

      <div className="myday-counts">
        {counts.map(([key, n, label, tone]) => (
          <div key={key} className={`myday-count ${n ? tone : ''}`}>
            <strong>{n}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <section className="myday-section">
        <h2>{t('Open work per project')}</h2>
        {projects.length === 0 ? (
          <p className="myday-empty">{t('Nothing open.')}</p>
        ) : (
          <table className="review-table">
            <thead>
              <tr>
                <th>{t('Project')}</th>
                <th>{t('Done this week')}</th>
                <th>{t('Open')}</th>
                <th>{t('Overdue')}</th>
                <th>{t('Estimated')}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((r) => (
                <tr key={r.projectId ?? 'none'}>
                  <td>
                    <span className="review-project">
                      <span className="review-swatch" style={{ '--project-color': projectIndex.colorOf(r.projectId) }} />
                      {projectName(r.projectId)}
                    </span>
                  </td>
                  <td>{r.done || '–'}</td>
                  <td>{r.open || '–'}</td>
                  <td className={r.overdue ? 'review-overdue' : ''}>{r.overdue || '–'}</td>
                  <td>{r.minutes ? formatEstimate(r.minutes) : '–'}</td>
                </tr>
              ))}
            </tbody>
            {totalMinutes > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4}>{t('Total estimated')}</td>
                  <td>{formatEstimate(totalMinutes)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </section>

      {section('done', t('Done'), review.done, t('Nothing completed this week.'), doneOn)}
      {section('overdue', t('Overdue'), review.overdue, t('Nothing overdue.'), dueOn, 'danger')}
      {section('next', t('Due next week'), review.dueNext, t('Nothing due the week after.'), dueOn)}
    </div>
  );
}

export default WeeklyReview;
