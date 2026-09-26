import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch, useAuth } from '../context/AuthContext';
import { timeAgo } from './TaskComments';
import { parseServerDate } from '../taskFilters';
import '../styles/NotificationBell.css';

const UPCOMING_WINDOW_DAYS = 3;
const POLL_INTERVAL_MS = 60000;

const describe = (n) => {
  const who = n.actor || 'Someone';
  if (n.kind === 'assigned') return `${who} assigned you`;
  if (n.kind === 'comment') return `${who} commented`;
  if (n.kind === 'unblocked') return `Ready to start — ${who} finished what it waited for`;
  return who;
};

function NotificationBell() {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [tRes, nRes] = await Promise.all([authFetch('/api/tasks/'), authFetch('/api/notifications/')]);
      if (tRes.ok) setTasks(await tRes.json());
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

  // Deadlines for tasks that are yours, or nobody's.
  const now = new Date();
  const upcomingCutoff = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const relevant = tasks.filter(
    (t) => t.deadline && t.status !== 'done' && (t.assignee_id == null || t.assignee_id === currentUser?.id)
  );
  const deadlineOf = (t) => parseServerDate(t.deadline);
  const overdue = relevant.filter((t) => deadlineOf(t) < now).sort((a, b) => deadlineOf(a) - deadlineOf(b));
  const upcoming = relevant
    .filter((t) => deadlineOf(t) >= now && deadlineOf(t) <= upcomingCutoff)
    .sort((a, b) => deadlineOf(a) - deadlineOf(b));

  const badge = notes.unread + overdue.length + upcoming.length;
  const badgeClass = overdue.length > 0 ? 'badge-urgent' : notes.unread > 0 ? 'badge-new' : 'badge-info';

  const formatDeadline = (t) => deadlineOf(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const goTo = (taskId, withComments = false) => {
    setOpen(false);
    load();
    navigate(`/?task=${taskId}${withComments ? '&comments=1' : ''}`);
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        className="bell-btn"
        onClick={toggle}
        title={notes.unread ? `${notes.unread} new notification${notes.unread === 1 ? '' : 's'}` : 'Notifications'}
        aria-expanded={open}
      >
        🔔
        {badge > 0 && <span className={`bell-badge ${badgeClass}`}>{badge > 99 ? '99+' : badge}</span>}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-dropdown-header">Notifications</div>
          {notes.items.length === 0 ? (
            <p className="bell-empty">Nothing yet — you'll see new assignments and comments here.</p>
          ) : (
            <div className="bell-list">
              {notes.items.map((n) => (
                <button
                  className={`bell-item ${n.read ? '' : 'bell-unread'}`}
                  key={n.id}
                  onClick={() => n.task_id && goTo(n.task_id, n.kind === 'comment')}
                  disabled={!n.task_id}
                >
                  <span className="bell-item-meta">
                    {describe(n)} · <span title={parseServerDate(n.created_at)?.toLocaleString()}>{timeAgo(n.created_at)}</span>
                  </span>
                  <span className="bell-item-title">{n.task_title || 'Deleted task'}</span>
                  {n.excerpt && <span className="bell-item-excerpt">{n.excerpt}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="bell-dropdown-header bell-subheader">Deadlines</div>
          {overdue.length + upcoming.length === 0 ? (
            <p className="bell-empty">No upcoming deadlines</p>
          ) : (
            <div className="bell-list">
              {overdue.map((t) => (
                <button className="bell-item" key={t.id} onClick={() => goTo(t.id)}>
                  <span className="bell-item-title">{t.title}</span>
                  <span className="bell-item-badge bell-overdue">Overdue · {formatDeadline(t)}</span>
                </button>
              ))}
              {upcoming.map((t) => (
                <button className="bell-item" key={t.id} onClick={() => goTo(t.id)}>
                  <span className="bell-item-title">{t.title}</span>
                  <span className="bell-item-badge bell-upcoming">Due {formatDeadline(t)}</span>
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
