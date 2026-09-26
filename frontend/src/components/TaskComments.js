import React, { useState, useEffect, useCallback } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import { parseServerDate } from '../taskFilters';
import { describeActivity } from '../activity';
import '../styles/TaskComments.css';

const errorText = async (res) => {
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.detail) ? data.detail[0].msg : data.detail || `HTTP ${res.status}`;
};

export function timeAgo(value, now = Date.now()) {
  const d = parseServerDate(value);
  if (!d) return '';
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return d.toLocaleDateString();
}

const SHOW_ACTIVITY_KEY = 'pm.showActivity';

function readShowActivity() {
  try {
    return localStorage.getItem(SHOW_ACTIVITY_KEY) !== '0';
  } catch {
    return true;
  }
}

// Comments and the task's history as one timeline. onCountChange(n) keeps
// the task's 💬 count in the list up to date without reloading everything;
// changeKey changes whenever the task does, so the history refreshes.
function TaskComments({ taskId, onCountChange, changeKey }) {
  const { currentUser } = useAuth();
  const [comments, setComments] = useState(null);
  const [activity, setActivity] = useState([]);
  const [showActivity, setShowActivity] = useState(readShowActivity);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null); // { id, body }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/tasks/${taskId}/comments`);
      if (!res.ok) throw new Error(await errorText(res));
      const list = await res.json();
      setComments(list);
      onCountChange?.(list.length);
    } catch (err) {
      setError('Could not load comments: ' + err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    authFetch(`/api/tasks/${taskId}/activity`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => !cancelled && setActivity(list))
      .catch(() => {}); // the history is a nice-to-have; comments still work
    return () => {
      cancelled = true;
    };
  }, [taskId, changeKey]);

  const toggleActivity = () => {
    const next = !showActivity;
    setShowActivity(next);
    try {
      localStorage.setItem(SHOW_ACTIVITY_KEY, next ? '1' : '0');
    } catch {
      /* not remembered */
    }
  };

  const time = (x) => parseServerDate(x.created_at)?.getTime() || 0;
  const timeline = [
    ...(comments || []).map((c) => ({ type: 'comment', key: `c${c.id}`, at: time(c), item: c })),
    ...(showActivity ? activity : []).map((a) => ({ type: 'activity', key: `a${a.id}`, at: time(a), item: a })),
  ].sort((x, y) => x.at - y.at);

  const act = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    act(async () => {
      if (!draft.trim()) return;
      const res = await authFetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) throw new Error(await errorText(res));
      const c = await res.json();
      const next = [...(comments || []), c];
      setComments(next);
      onCountChange?.(next.length);
      setDraft('');
    });

  const saveEdit = () =>
    act(async () => {
      const res = await authFetch(`/api/comments/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editing.body }),
      });
      if (!res.ok) throw new Error(await errorText(res));
      const c = await res.json();
      setComments((list) => list.map((x) => (x.id === c.id ? c : x)));
      setEditing(null);
    });

  const remove = (c) => {
    if (!window.confirm('Delete this comment?')) return;
    act(async () => {
      const res = await authFetch(`/api/comments/${c.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await errorText(res));
      const next = comments.filter((x) => x.id !== c.id);
      setComments(next);
      onCountChange?.(next.length);
    });
  };

  // Ctrl/Cmd+Enter sends, Escape cancels an edit.
  const keys = (onSubmit, onCancel) => (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
    } else if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  };

  return (
    <div className="task-comments" onDragStart={(e) => e.stopPropagation()}>
      {error && <div className="error-message">{error}</div>}
      {activity.length > 0 && (
        <div className="activity-toggle">
          <button className="link-btn" onClick={toggleActivity} aria-pressed={showActivity}>
            {showActivity ? 'Hide history' : `Show history (${activity.length})`}
          </button>
        </div>
      )}
      {comments === null && !error && <p className="comments-empty">Loading…</p>}
      {comments && comments.length === 0 && <p className="comments-empty">No comments yet.</p>}

      {comments &&
        timeline.map(({ type, key, item: c }) => {
          if (type === 'activity') {
            return (
              <div className="activity-entry" key={key}>
                <span className="activity-text">
                  <span className="comment-author">{c.actor || 'Someone'}</span> {describeActivity(c)}
                </span>
                <span className="activity-time" title={parseServerDate(c.created_at)?.toLocaleString()}>
                  {timeAgo(c.created_at)}
                </span>
              </div>
            );
          }
          const mine = c.author_id != null && c.author_id === currentUser?.id;
          const canDelete = mine || currentUser?.is_admin;
          return (
            <div className="comment" key={key}>
              <div className="comment-meta">
                <span className="comment-author">{c.author || 'Unknown'}</span>
                <span title={parseServerDate(c.created_at)?.toLocaleString()}>{timeAgo(c.created_at)}</span>
                {c.edited_at && <span title={parseServerDate(c.edited_at)?.toLocaleString()}>(edited)</span>}
                <span className="comment-actions">
                  {mine && editing?.id !== c.id && (
                    <button className="link-btn" onClick={() => setEditing({ id: c.id, body: c.body })} disabled={busy}>
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button className="link-btn comment-delete" onClick={() => remove(c)} disabled={busy}>
                      Delete
                    </button>
                  )}
                </span>
              </div>
              {editing?.id === c.id ? (
                <div className="comment-edit">
                  <textarea
                    value={editing.body}
                    onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                    onKeyDown={keys(saveEdit, () => setEditing(null))}
                    rows="3"
                    autoFocus
                  />
                  <div className="comment-buttons">
                    <button className="btn btn-primary btn-small" onClick={saveEdit} disabled={busy || !editing.body.trim()}>
                      Save
                    </button>
                    <button className="btn btn-secondary btn-small" onClick={() => setEditing(null)} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="comment-body">{c.body}</p>
              )}
            </div>
          );
        })}

      <div className="comment-new">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={keys(add)}
          placeholder="Write a comment…  (Ctrl+Enter to send)"
          rows="2"
          aria-label="New comment"
        />
        <button className="btn btn-primary btn-small" onClick={add} disabled={busy || !draft.trim()}>
          Comment
        </button>
      </div>
    </div>
  );
}

export default TaskComments;
