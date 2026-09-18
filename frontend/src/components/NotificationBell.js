import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../context/AuthContext';
import '../styles/NotificationBell.css';

const UPCOMING_WINDOW_DAYS = 3;
const POLL_INTERVAL_MS = 60000;

function NotificationBell() {
  const [tasks, setTasks] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch('/api/tasks/');
        if (res.ok) setTasks(await res.json());
      } catch {
        // notifications are best-effort; ignore transient failures
      }
    };
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const now = new Date();
  const upcomingCutoff = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const withDeadlines = tasks.filter((t) => t.deadline && t.status !== 'done');
  const overdue = withDeadlines
    .filter((t) => new Date(t.deadline) < now)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const upcoming = withDeadlines
    .filter((t) => new Date(t.deadline) >= now && new Date(t.deadline) <= upcomingCutoff)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  const totalCount = overdue.length + upcoming.length;

  const formatDeadline = (deadline) => {
    const date = new Date(deadline);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleItemClick = () => {
    setOpen(false);
    navigate('/');
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button className="bell-btn" onClick={() => setOpen((v) => !v)} title="Deadline notifications">
        🔔
        {totalCount > 0 && (
          <span className={`bell-badge ${overdue.length > 0 ? 'badge-urgent' : 'badge-info'}`}>{totalCount}</span>
        )}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-dropdown-header">Deadlines</div>
          {totalCount === 0 ? (
            <p className="bell-empty">No upcoming deadlines</p>
          ) : (
            <div className="bell-list">
              {overdue.map((t) => (
                <div className="bell-item" key={t.id} onClick={handleItemClick}>
                  <span className="bell-item-title">{t.title}</span>
                  <span className="bell-item-badge bell-overdue">Overdue · {formatDeadline(t.deadline)}</span>
                </div>
              ))}
              {upcoming.map((t) => (
                <div className="bell-item" key={t.id} onClick={handleItemClick}>
                  <span className="bell-item-title">{t.title}</span>
                  <span className="bell-item-badge bell-upcoming">Due {formatDeadline(t.deadline)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
