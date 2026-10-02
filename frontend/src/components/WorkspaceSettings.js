import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { authFetch } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import TrashIcon from './TrashIcon';
import { buildProjectIndex } from '../projects';
import '../styles/Labels.css';
import { t, tn } from '../i18n';

const errorText = async (res) => {
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.detail) ? data.detail[0].msg : data.detail || `HTTP ${res.status}`;
};

const send = async (url, method, body) => {
  const res = await authFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorText(res));
};

// Every top-level project with a workspace choice, to sort them all in one
// place; a choice is saved right away. Archived projects come last.
function WorkspaceProjects({ setStatus }) {
  const { workspaces, workspaceOf, assignProject } = useWorkspace();
  const [projects, setProjects] = useState(null);
  const [onlyUnfiled, setOnlyUnfiled] = useState(false);
  const [saving, setSaving] = useState({}); // projectId -> workspace id (or null) being saved

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/projects/');
      if (res.ok) setProjects(await res.json());
    } catch {
      // offline: no list
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const index = useMemo(() => buildProjectIndex(projects || []), [projects]);
  if (!projects || index.allTopLevel.length === 0) return null;

  const current = (id) => (id in saving ? saving[id] : workspaceOf(id)?.id ?? null);
  const all = [...index.topLevel, ...index.archived];
  const unfiled = all.filter((p) => workspaceOf(p.id) == null).length;
  const shown = onlyUnfiled ? all.filter((p) => current(p.id) == null || p.id in saving) : all;

  const choose = async (project, value) => {
    const workspaceId = value === '' ? null : Number(value);
    setStatus(null);
    setSaving((s) => ({ ...s, [project.id]: workspaceId }));
    try {
      await assignProject(project.id, workspaceId);
    } catch (err) {
      setStatus({ ok: false, text: t('Failed to save: {error}', { error: err.message }) });
    }
    setSaving((s) => {
      const next = { ...s };
      delete next[project.id];
      return next;
    });
  };

  return (
    <div className="workspace-projects">
      <div className="workspace-projects-head">
        <h3>{t('Your projects')}</h3>
        <span className="label-usage">
          {unfiled ? tn(unfiled, 'one in no workspace', '{n} in no workspace') : t('all filed')}
        </span>
        <label className="workspace-projects-filter">
          <input type="checkbox" checked={onlyUnfiled} onChange={(e) => setOnlyUnfiled(e.target.checked)} />
          {t('only those in no workspace')}
        </label>
      </div>
      <ul className="workspace-project-list">
        {shown.map((p) => (
          <li key={p.id} style={{ '--project-color': index.colorOf(p.id) }}>
            <span className="workspace-project-name">
              {p.name}
              {p.archived_at && <span className="label-usage">{t('archived')}</span>}
            </span>
            <select
              value={current(p.id) ?? ''}
              onChange={(e) => choose(p, e.target.value)}
              aria-label={t('Workspace of {name}', { name: p.name })}
            >
              <option value="">{t('— none —')}</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <p className="settings-help workspace-projects-note">
        {t('Categories, tasks and subtasks always go with their project. Tasks without a project follow the setting above.')}
      </p>
    </div>
  );
}

// Settings → Workspaces: the user's own groups of projects (name, color,
// order, delete), and where projects in none of them show up.
function WorkspaceSettings() {
  const { workspaces, unassignedEverywhere, reload } = useWorkspace();
  const [editing, setEditing] = useState(null); // { id, name, color }
  const [newName, setNewName] = useState('');
  const [status, setStatus] = useState(null);
  // The choice for unfiled projects, shown right away while it's being saved.
  const [savingUnassigned, setSavingUnassigned] = useState(null);
  const everywhere = savingUnassigned ?? unassignedEverywhere;

  const run = async (fn) => {
    setStatus(null);
    try {
      await fn();
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    }
    await reload();
  };

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await send('/api/v1/workspaces/', 'POST', { name: newName });
      setNewName('');
    });
  };

  const save = () =>
    run(async () => {
      await send(`/api/v1/workspaces/${editing.id}`, 'PUT', { name: editing.name, color: editing.color });
      setEditing(null);
    });

  const move = (index, delta) => {
    const ids = workspaces.map((w) => w.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    run(() => send('/api/v1/workspaces/order', 'PUT', { ids }));
  };

  const remove = (w) => {
    const filed = w.project_ids.length
      ? ' ' + tn(w.project_ids.length, 'Its project stays, in no workspace.', 'Its {n} projects stay, in no workspace.')
      : '';
    if (!window.confirm(t('Delete the workspace “{name}”?', { name: w.name }) + filed)) return;
    run(() => send(`/api/v1/workspaces/${w.id}`, 'DELETE'));
  };

  const setUnassigned = async (value) => {
    setSavingUnassigned(value);
    await run(() => send('/api/v1/workspaces/settings', 'PUT', { unassigned_everywhere: value }));
    setSavingUnassigned(null);
  };

  return (
    <div className="settings-section">
      <h2>{t('Workspaces')}</h2>
      <p className="settings-help">
        {t(
          'Separate areas like work and private: the switch in the top bar shows one workspace at a time — its projects and their tasks in every view — or all of them. Put projects into a workspace in the list below, or when creating or editing one. Workspaces are just for you; everyone files projects their own way.'
        )}
      </p>

      {workspaces.length === 0 && <p className="settings-help">{t('No workspaces yet.')}</p>}
      {workspaces.length > 0 && (
        <ul className="label-list workspace-list">
          {workspaces.map((w, i) =>
            editing?.id === w.id ? (
              <li key={w.id}>
                <input
                  type="color"
                  value={editing.color || '#9e9e9e'}
                  onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                  aria-label={t('Workspace color')}
                />
                <input
                  type="text"
                  value={editing.name}
                  maxLength={40}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  aria-label={t('Workspace name')}
                  autoFocus
                />
                <button className="btn btn-primary btn-small" onClick={save} disabled={!editing.name.trim()}>
                  {t('Save')}
                </button>
                <button className="btn btn-secondary btn-small" onClick={() => setEditing(null)}>
                  {t('Cancel')}
                </button>
              </li>
            ) : (
              <li key={w.id}>
                <span className="workspace-chip" style={{ '--ws-color': w.color || '#9e9e9e' }}>
                  {w.name}
                </span>
                <span className="label-usage">{tn(w.project_ids.length, 'one project', '{n} projects')}</span>
                <span className="label-actions">
                  <button className="task-action-btn" onClick={() => move(i, -1)} disabled={i === 0} title={t('Move up')} aria-label={t('Move up')}>
                    ↑
                  </button>
                  <button
                    className="task-action-btn"
                    onClick={() => move(i, 1)}
                    disabled={i === workspaces.length - 1}
                    title={t('Move down')}
                    aria-label={t('Move down')}
                  >
                    ↓
                  </button>
                  <button className="task-action-btn" onClick={() => setEditing({ ...w })} title={t('Rename / recolor')}>
                    ✎
                  </button>
                  <button className="task-action-btn delete-btn" onClick={() => remove(w)} title={t('Delete workspace')} aria-label={t('Delete workspace')}>
                    <TrashIcon />
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      )}

      <form className="archive-form" onSubmit={add}>
        <label htmlFor="new-workspace">{t('New workspace')}</label>
        <input
          id="new-workspace"
          type="text"
          className="label-name-input"
          maxLength={40}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('e.g. Work, Private, Club')}
        />
        <button type="submit" className="btn btn-primary btn-small" disabled={!newName.trim()}>
          {t('Add')}
        </button>
      </form>

      {workspaces.length > 0 && (
        <fieldset className="workspace-unassigned">
          <legend>{t('Projects in no workspace')}</legend>
          <label>
            <input type="radio" checked={everywhere} onChange={() => setUnassigned(true)} />
            {t('show in every workspace')}
          </label>
          <label>
            <input type="radio" checked={!everywhere} onChange={() => setUnassigned(false)} />
            {t('show only under “All workspaces”')}
          </label>
        </fieldset>
      )}
      {workspaces.length > 0 && <WorkspaceProjects setStatus={setStatus} />}
      {status && <p className={status.ok ? 'settings-ok' : 'error-message'}>{status.text}</p>}
    </div>
  );
}

export default WorkspaceSettings;
