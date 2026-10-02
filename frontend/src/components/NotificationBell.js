import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch, useAuth } from '../context/AuthContext';
import { timeAgo } from './TaskComments';
import { parseServerDate } from '../taskFilters';
import '../styles/NotificationBell.css';
import { t, tn, locale } from '../i18n';
import { useSyncRefresh } from '../desktop/useSyncRefresh';
import { buildProjectIndex, withoutArchived } from '../projects';
import { useWorkspace } from '../context/WorkspaceContext';

const UPCOMING_WINDOW_DAYS = 3;
const POLL_INTERVAL_MS = 60000;

export const describeNotification = (n) => {
  const who = n.actor || t('Someone');
  if (n.kind === 'assigned') return t('{who} assigned you', { who });
  if (n.kind === 'comment') return t('{who} commented', { who });
  if (n.kind === 'mention') return t('{who} mentioned you', { who });
  if (n.kind === 'unblocked') return t('Ready to start — {who} finished what it waited for', { who });
  return who;
};

/** The server writes a few excerpts in English; show them in the UI language. */
export const notificationExcerpt = (n) => {
  const text = n.excerpt || '';
  let m = /^and (\d+) more tasks?$/.exec(text);
  if (m) return tn(parseInt(m[1], 10), 'and one more task', 'and {n} more tasks');
  m = /^Done: ([\s\S]*)$/.exec(text);
  if (m && n.kind === 'unblocked') return t('Done: {title}', { title: m[1] });
  return text;
};

function NotificationBell() {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [notes, setNotes] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const workspace = useWorkspace();

  const load = useCallback(async () => {
    try {
      const [tRes, nRes, pRes] = await Promise.all([
        authFetch('/api/tasks/'),
        authFetch('/api/notifications/'),
        authFetch('/api/projects/'),
      ]);
      if (tRes.ok) setTasks(await tRes.json());
      if (pRes.ok) setProjects(await pRes.json());
      if (nRes.ok) setNotes(await nRes.json());
    } catch {
      // notifications are best-effort; ignore transient failures
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);
  useSyncRefresh(load);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Opening the bell marks everything read on the server; the items stay
  // highlighted until it's closed so you can still see what was new.
  const toggle = async () => {
    const opening = !open;
    setOpen(opening);
    if (opening && notes.unread > 0) {
      try {
        await authFetch('/api/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch {
        // retried next time
      }
    }
    if (!opening) load();
  };

  // The bell covers all workspaces. Showing one, items from elsewhere say
  // where they are, and opening one switches there first.
  const taskById = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks]);
  const projectIndex = useMemo(() => buildProjectIndex(projects), [projects]);
  const elsewhere = (taskId) => {
    const { scope } = workspace;
    if (!scope || taskId == null || !taskById.has(taskId)) return null;
    let top = null;
    for (let cur = taskById.get(taskId); cur; cur = taskById.get(cur.parent_task_id)) {
      if (cur.project_id != null) {
        top = projectIndex.topOf(cur.project_id)?.id ?? null;
        break;
      }
    }
    if (scope.includes(top)) return null;
    // Not in any workspace (shown only under "All"): go to All.
    return workspace.workspaceOf(top) || { id: null, name: t('All workspaces'), color: null };
  };
  const newElsewhere = new Map(); // workspace name -> unread count
  for (const n of notes.items) {
    const where = !n.read && elsewhere(n.task_id);
    if (where) newElsewhere.set(where.name, (newElsewhere.get(where.name) || 0) + 1);
  }
  const whereTag = (where) =>
    where && (
      <span className="bell-item-where" style={where.color ? { '--ws-color': where.color } : undefined}>
        {t('in {name}', { name: where.name })}
      </span>
    );

  // Deadlines for tasks that are yours, or nobody's.
  const now = new Date();
  const upcomingCutoff = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // Archived projects don't remind anyone.
  const relevant = withoutArchived(tasks, buildProjectIndex(projects)).filter(
    (t) => t.deadline && t.status !== 'done' && (t.assignee_id == null || t.assignee_id === currentUser?.id)
  );
  const deadlineOf = (t) => parseServerDate(t.deadline);
  const overdue = relevant.filter((t) => deadlineOf(t) < now).sort((a, b) => deadlineOf(a) - deadlineOf(b));
  const upcoming = relevant
    .filter((t) => deadlineOf(t) >= now && deadlineOf(t) <= upcomingCutoff)
    .sort((a, b) => deadlineOf(a) - deadlineOf(b));

  const badge = notes.unread + overdue.length + upcoming.length;
  const badgeClass = overdue.length > 0 ? 'badge-urgent' : notes.unread > 0 ? 'badge-new' : 'badge-info';

  const formatDeadline = (task) => deadlineOf(task).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });

  const goTo = (taskId, withComments = false) => {
    setOpen(false);
    const where = elsewhere(taskId);
    if (where) workspace.setCurrent(where.id);
    load();
    navigate(`/?task=${taskId}${withComments ? '&comments=1' : ''}`);
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        className="bell-btn"
        onClick={toggle}
        title={notes.unread ? tn(notes.unread, 'one new notification', '{n} new notifications') : t('Notifications')}
        aria-expanded={open}
      >
        🔔
        {badge > 0 && <span className={`bell-badge ${badgeClass}`}>{badge > 99 ? '99+' : badge}</span>}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-dropdown-header">{t('Notifications')}</div>
          {newElsewhere.size > 0 && (
            <p className="bell-elsewhere">
              {[...newElsewhere]
                .map(([name, n]) => tn(n, 'one new in {name}', '{n} new in {name}', { name }))
                .join(' · ')}
            </p>
          )}
          {notes.items.length === 0 ? (
            <p className="bell-empty">{t("Nothing yet — you'll see new assignments and comments here.")}</p>
          ) : (
            <div className="bell-list">
              {notes.items.map((n) => (
                <button
                  className={`bell-item ${n.read ? '' : 'bell-unread'}`}
                  key={n.id}
                  onClick={() => n.task_id && goTo(n.task_id, n.kind === 'comment' || n.kind === 'mention')}
                  disabled={!n.task_id}
                >
                  <span className="bell-item-meta">
                    {describeNotification(n)} · <span title={parseServerDate(n.created_at)?.toLocaleString()}>{timeAgo(n.created_at)}</span>
                    {whereTag(elsewhere(n.task_id))}
                  </span>
                  <span className="bell-item-title">{n.task_title || t('Deleted task')}</span>
                  {n.excerpt && <span className="bell-item-excerpt">{notificationExcerpt(n)}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="bell-dropdown-header bell-subheader">{t('Deadlines')}</div>
          {overdue.length + upcoming.length === 0 ? (
            <p className="bell-empty">{t('No upcoming deadlines')}</p>
          ) : (
            <div className="bell-list">
              {overdue.map((task) => (
                <button className="bell-item" key={task.id} onClick={() => goTo(task.id)}>
                  <span className="bell-item-title">
                    {task.title}
                    {whereTag(elsewhere(task.id))}
                  </span>
                  <span className="bell-item-badge bell-overdue">
                    {t('Overdue · {date}', { date: formatDeadline(task) })}
                  </span>
                </button>
              ))}
              {upcoming.map((task) => (
                <button className="bell-item" key={task.id} onClick={() => goTo(task.id)}>
                  <span className="bell-item-title">
                    {task.title}
                    {whereTag(elsewhere(task.id))}
                  </span>
                  <span className="bell-item-badge bell-upcoming">{t('Due {date}', { date: formatDeadline(task) })}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
