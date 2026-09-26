import React, { useEffect, useState, useCallback } from 'react';
import { authFetch } from '../context/AuthContext';
import { labelTextColor } from '../labels';
import '../styles/Labels.css';

const errorText = async (res) => {
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.detail) ? data.detail[0].msg : data.detail || `HTTP ${res.status}`;
};

// Settings → Labels: shared by everyone; rename, recolor, delete, add.
function LabelSettings() {
  const [labels, setLabels] = useState(null);
  const [editing, setEditing] = useState(null); // { id, name, color }
  const [newName, setNewName] = useState('');
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    const res = await authFetch('/api/labels/');
    if (res.ok) setLabels(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setStatus(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    }
  };

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await authFetch('/api/labels/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error(await errorText(res));
      setNewName('');
    });
  };

  const save = () =>
    run(async () => {
      const res = await authFetch(`/api/labels/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editing.name, color: editing.color }),
      });
      if (!res.ok) throw new Error(await errorText(res));
      setEditing(null);
    });

  const remove = (l) => {
    const used = l.task_count ? ` It's on ${l.task_count} task${l.task_count === 1 ? '' : 's'}; they keep everything else.` : '';
    if (!window.confirm(`Delete the label "${l.name}"?${used}`)) return;
    run(async () => {
      const res = await authFetch(`/api/labels/${l.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await errorText(res));
    });
  };

  return (
    <div className="settings-section">
      <h2>Labels</h2>
      <p className="settings-help">
        Colored tags for tasks across all projects, shared by everyone. Add them here or right in the task form; click a
        label on a task to show all tasks with it.
      </p>

      {labels && labels.length === 0 && <p className="settings-help">No labels yet.</p>}
      {labels && labels.length > 0 && (
        <ul className="label-list">
          {labels.map((l) =>
            editing?.id === l.id ? (
              <li key={l.id}>
                <input
                  type="color"
                  value={editing.color}
                  onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                  aria-label="Label color"
                />
                <input
                  type="text"
                  value={editing.name}
                  maxLength={40}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  aria-label="Label name"
                  autoFocus
                />
                <button className="btn btn-primary btn-small" onClick={save} disabled={!editing.name.trim()}>
                  Save
                </button>
                <button className="btn btn-secondary btn-small" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </li>
            ) : (
              <li key={l.id}>
                <span className="label-chip" style={{ backgroundColor: l.color, color: labelTextColor(l.color) }}>
                  {l.name}
                </span>
                <span className="label-usage">
                  {l.task_count} task{l.task_count === 1 ? '' : 's'}
                </span>
                <span className="label-actions">
                  <button className="task-action-btn" onClick={() => setEditing({ ...l })} title="Rename / recolor">
                    ✎
                  </button>
                  <button className="task-action-btn delete-btn" onClick={() => remove(l)} title="Delete label">
                    ✕
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      )}

      <form className="archive-form" onSubmit={add}>
        <label htmlFor="new-label">New label</label>
        <input
          id="new-label"
          type="text"
          className="label-name-input"
          maxLength={40}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. waiting for supplier"
        />
        <button type="submit" className="btn btn-primary btn-small" disabled={!newName.trim()}>
          Add
        </button>
      </form>
      {status && <p className={status.ok ? 'settings-ok' : 'error-message'}>{status.text}</p>}
    </div>
  );
}

export default LabelSettings;
