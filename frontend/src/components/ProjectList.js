import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import ProjectForm from './ProjectForm';
import TrashIcon from './TrashIcon';
import ProjectShare from './ProjectShare';
import { ArchiveIcon, LinkIcon } from './icons';
import { parseServerDate } from '../taskFilters';
import { authFetch, useAuth } from '../context/AuthContext';
import { buildProjectIndex } from '../projects';
import { useWorkspace } from '../context/WorkspaceContext';
import { progressByProject, combineProgress, percentDone } from '../progress';
import '../styles/TaskList.css';
import '../styles/ProjectList.css';
import { t, tn, shortDate } from '../i18n';
import { useSyncRefresh } from '../desktop/useSyncRefresh';


function ProgressBar({ stats, small = false }) {
  const pct = percentDone(stats);
  return (
    <span
      className={`progress-bar ${small ? 'small' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={t('{pct}% done', { pct })}
      title={t('{done} of {total} done', { done: stats.done, total: stats.total })}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

// Progress of a project (with its categories): bar, counts that open the
// matching filter on the Tasks page, and the next deadline.
function ProjectProgress({ stats, projectId }) {
  if (!stats.total) return <p className="progress-text progress-empty">{t('No tasks yet')}</p>;
  const open = stats.total - stats.done;
  const tasksUrl = (extra) => `/?project=${projectId}&${extra}`;
  return (
    <div className="project-progress">
      <ProgressBar stats={stats} />
      <p className="progress-text">
        <strong>{percentDone(stats)}%</strong>
        <span>{t('{done} of {total} done', { done: stats.done, total: stats.total })}</span>
        {open > 0 && <Link to={tasksUrl('status=open')}>{t('{n} open', { n: open })}</Link>}
        {stats.overdue > 0 && (
          <Link className="progress-overdue" to={tasksUrl('due=overdue')}>
            {t('{n} overdue', { n: stats.overdue })}
          </Link>
        )}
        {stats.dueSoon > 0 && <Link to={tasksUrl('due=week')}>{t('{n} due this week', { n: stats.dueSoon })}</Link>}
        {stats.next && (
          <span className="progress-next">
            {t('Next:')} <Link to={`/?task=${stats.next.id}`}>{stats.next.title}</Link> · {shortDate(stats.next.deadline)}
          </span>
        )}
      </p>
    </div>
  );
}

function ProjectList() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [progress, setProgress] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // null: closed; { project } to edit; { parentId } to create
  const [form, setForm] = useState(null);
  const [notice, setNotice] = useState(null);
  const importRef = useRef(null);
  // The project whose share link is open, and whether archived projects are shown.
  const [shareOpen, setShareOpen] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const workspace = useWorkspace();
  const projectIndex = useMemo(() => buildProjectIndex(projects, workspace.scope), [projects, workspace.scope]);

  const parseApiError = async (response) => {
    try {
      const data = await response.json();
      if (Array.isArray(data.detail)) {
        return data.detail.map((d) => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join(', ');
      }
      return data.detail || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  };

  const fetchJson = async (url, options) => {
    const response = await authFetch(url, options);
    if (!response.ok) throw new Error(await parseApiError(response));
    return response.json();
  };

  const loadData = async () => {
    try {
      const [projectsRes, tasksRes, usersRes] = await Promise.all([
        fetchJson('/api/projects/'),
        fetchJson('/api/tasks/'),
        fetchJson('/api/users/'),
      ]);
      setProjects(projectsRes);
      setUsers(usersRes);
      setProgress(progressByProject(tasksRes));
      setError(null);
    } catch (err) {
      setError(t('Failed to load projects: {error}', { error: err.message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useSyncRefresh(loadData);

  const handleSubmit = async ({ workspace_id: workspaceId, ...formData }) => {
    try {
      let saved;
      if (form.project) {
        saved = await fetchJson(`/api/projects/${form.project.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      } else {
        saved = await fetchJson('/api/projects/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      }
      // The workspace is the user's own filing, saved separately.
      const before = form.project ? workspace.workspaceOf(form.project.id)?.id ?? null : null;
      if (workspaceId !== undefined && saved.parent_id == null && workspaceId !== before) {
        await workspace.assignProject(saved.id, workspaceId);
      }
      setForm(null);
      await loadData();
    } catch (err) {
      setError(t('Failed to save: {error}', { error: err.message }));
    }
  };

  const handleDelete = async (project) => {
    const categories = projectIndex.categoriesOf(project.id);
    const msg = categories.length
      ? tn(
          categories.length,
          'Delete “{name}” and its category? Their tasks are kept but will no longer belong to a project.',
          'Delete “{name}” and its {n} categories? Their tasks are kept but will no longer belong to a project.',
          { name: project.name }
        )
      : t('Delete “{name}”? Its tasks are kept but will no longer belong to a project.', { name: project.name });
    if (!window.confirm(msg)) return;
    try {
      const response = await authFetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await parseApiError(response));
      await loadData();
    } catch (err) {
      setError(t('Failed to delete: {error}', { error: err.message }));
    }
  };

  const setArchived = async (project, archived, stats) => {
    if (archived) {
      const open = stats.total - stats.done;
      const msg =
        t('Archive “{name}”? It’s hidden from the lists and choices; search still finds its tasks, and you can restore it any time.', {
          name: project.name,
        }) + (open ? ' ' + tn(open, 'One task in it is still open.', '{n} tasks in it are still open.') : '');
      if (!window.confirm(msg)) return;
    }
    try {
      await fetchJson(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      setShareOpen(null);
      await loadData();
      setNotice(
        archived
          ? t('“{name}” is archived. It’s under “Archived projects” at the bottom.', { name: project.name })
          : t('“{name}” is back.', { name: project.name })
      );
    } catch (err) {
      setError(t('Failed to save: {error}', { error: err.message }));
    }
  };

  const shareButton = (project) => (
    <button
      className={`task-action-btn share-btn ${project.share_token ? 'active' : ''}`}
      onClick={() => setShareOpen(shareOpen === project.id ? null : project.id)}
      title={project.share_token ? t('Shared with a link') : t('Share a read-only link')}
      aria-label={t('Share')}
      aria-expanded={shareOpen === project.id}
    >
      <LinkIcon />
    </button>
  );

  // Export: one project (with categories and tasks), or everything incl.
  // tasks without a project. See backend/app/routers/transfer.py.
  const exportProjects = async (project = null) => {
    try {
      const url = project ? `/api/transfer/export?project_id=${project.id}` : '/api/transfer/export';
      const data = await fetchJson(url);
      const slug = (project ? project.name : 'all-projects').replace(/[^A-Za-z0-9._-]+/g, '-');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      setError(t('Export failed: {error}', { error: err.message }));
    }
  };

  const importProjects = async (file) => {
    setNotice(null);
    try {
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error(t('this is not a JSON file'));
      }
      const res = await fetchJson('/api/transfer/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const renamed = res.renamed.map((r) => `"${r.from}" → "${r.to}"`).join(', ');
      setNotice(
        t('Imported {projects}, {categories} and {tasks}.', {
          projects: tn(res.projects, 'one project', '{n} projects'),
          categories: tn(res.categories, 'one category', '{n} categories'),
          tasks: tn(res.tasks, 'one task', '{n} tasks'),
        }) + (renamed ? ' ' + t('Renamed because the name was taken: {names}.', { names: renamed }) : '')
      );
      setError(null);
      await loadData();
    } catch (err) {
      setError(t('Import failed: {error}', { error: err.message }));
    }
  };

  const openForm = (value) => {
    setForm(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <div className="container"><p>{t('Loading projects…')}</p></div>;

  const EMPTY = combineProgress([]);
  const memberNames = (p) =>
    (p.member_ids || [])
      .map((id) => users.find((u) => u.id === id)?.username)
      .filter(Boolean)
      .join(', ');
  const statsOf = (id) => progress.get(id) || EMPTY;

  return (
    <div className="container">
      <div className="task-list-header">
        <div className="header-left">
          <h1>{t('Projects')}</h1>
          <span className="task-count">({projectIndex.topLevel.length})</span>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => importRef.current?.click()} title={t('Import projects from a JSON export')}>
            {t('Import')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => exportProjects()}
            title={t('Export all projects and tasks as JSON')}
            disabled={projectIndex.topLevel.length === 0}
          >
            {t('Export all')}
          </button>
          <button className="btn btn-primary" onClick={() => openForm({ parentId: null })}>
            {t('+ New Project')}
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) importProjects(f);
            }}
          />
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {notice && <div className="success-message">{notice}</div>}

      {form && (
        <div className="form-container">
          <ProjectForm
            key={form.project ? `e${form.project.id}` : `n${form.parentId}`}
            project={form.project || null}
            defaultParentId={form.parentId ?? null}
            projectIndex={projectIndex}
            users={users}
            currentUser={currentUser}
            workspaces={workspace.workspaces}
            // New projects go into the workspace being shown.
            workspaceId={form.project ? workspace.workspaceOf(form.project.id)?.id ?? null : workspace.current?.id ?? null}
            onSubmit={handleSubmit}
            onCancel={() => setForm(null)}
          />
        </div>
      )}

      <div className="project-list">
        {projectIndex.topLevel.length === 0 ? (
          <p className="no-tasks">
            {workspace.current
              ? t('No projects in “{name}” yet. New projects go into it; to move one, edit it under “All workspaces”.', { name: workspace.current.name })
              : t('No projects yet')}
          </p>
        ) : (
          projectIndex.topLevel.map((project) => {
            const categories = projectIndex.categoriesOf(project.id);
            const stats = combineProgress([statsOf(project.id), ...categories.map((c) => statsOf(c.id))]);
            return (
              <div className="project-item" key={project.id} style={{ '--project-color': projectIndex.colorOf(project.id) }}>
                <div className="project-row">
                  <span className="project-swatch" />
                  <div className="project-info">
                    <h3>
                      {project.name}
                      {project.is_private && (
                        <span
                          className="private-badge"
                          title={t('Private: visible to {names} and admins', { names: memberNames(project) || t('nobody but admins') })}
                        >
                          {t('🔒 Private')}
                        </span>
                      )}
                      {!workspace.current && workspace.workspaceOf(project.id) && (
                        <span className="workspace-badge" style={{ '--ws-color': workspace.workspaceOf(project.id).color }}>
                          {workspace.workspaceOf(project.id).name}
                        </span>
                      )}
                    </h3>
                    {project.is_private && (
                      <p className="project-members">
                        {t('Members: {names}', { names: memberNames(project) || t('none (admins only)') })}
                      </p>
                    )}
                    {project.description && <p>{project.description}</p>}
                    <ProjectProgress stats={stats} projectId={project.id} />
                  </div>
                  <div className="project-actions">
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => openForm({ parentId: project.id })}
                      title={t('Add a category (sub-project)')}
                    >
                      {t('+ Category')}
                    </button>
                    <button
                      className="task-action-btn"
                      onClick={() => exportProjects(project)}
                      title={t('Export {name} (with categories and tasks) as JSON', { name: project.name })}
                    >
                      ⤓
                    </button>
                    {shareButton(project)}
                    <button
                      className="task-action-btn archive-btn"
                      onClick={() => setArchived(project, true, stats)}
                      title={t('Archive (finished)')}
                      aria-label={t('Archive')}
                    >
                      <ArchiveIcon />
                    </button>
                    <button className="task-action-btn edit-btn" onClick={() => openForm({ project })} title={t('Edit')}>
                      ✎
                    </button>
                    <button className="task-action-btn delete-btn" onClick={() => handleDelete(project)} title={t('Delete')} aria-label={t('Delete')}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                {shareOpen === project.id && <ProjectShare project={project} onChanged={loadData} onError={setError} />}

                {categories.length > 0 && (
                  <ul className="category-list">
                    {categories.map((c) => (
                      <li key={c.id} className="category-row">
                        <span className="category-name">{c.name}</span>
                        <ProgressBar stats={statsOf(c.id)} small />
                        <span className="category-progress">
                          {statsOf(c.id).done}/{statsOf(c.id).total}
                        </span>
                        {statsOf(c.id).overdue > 0 && (
                          <Link className="progress-overdue category-overdue" to={`/?project=${c.id}&due=overdue`}>
                            {t('{n} overdue', { n: statsOf(c.id).overdue })}
                          </Link>
                        )}
                        {c.description && <span className="category-desc">{c.description}</span>}
                        <span className="project-actions">
                          <button className="task-action-btn edit-btn" onClick={() => openForm({ project: c })} title={t('Edit')}>
                            ✎
                          </button>
                          <button className="task-action-btn delete-btn" onClick={() => handleDelete(c)} title={t('Delete')} aria-label={t('Delete')}>
                            <TrashIcon />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>

      {projectIndex.archived.length > 0 && (
        <div className="archived-projects">
          <button className="completed-toggle" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            <span className="project-group-caret">{showArchived ? '▼' : '▶'}</span>
            {t('Archived projects ({n})', { n: projectIndex.archived.length })}
          </button>
          {showArchived && (
            <ul className="archived-list">
              {projectIndex.archived.map((project) => {
                const categories = projectIndex.categoriesOf(project.id);
                const stats = combineProgress([statsOf(project.id), ...categories.map((c) => statsOf(c.id))]);
                return (
                  <li key={project.id} className="archived-item" style={{ '--project-color': projectIndex.colorOf(project.id) }}>
                    <div className="archived-row">
                      <span className="project-swatch" />
                      <Link to={`/?project=${project.id}`} className="archived-name">
                        {project.name}
                      </Link>
                      <span className="label-usage">
                        {t('archived {date}', { date: shortDate(parseServerDate(project.archived_at)) })}
                        {' · '}
                        {t('{done} of {total} done', { done: stats.done, total: stats.total })}
                      </span>
                      <span className="project-actions">
                        {shareButton(project)}
                        <button className="btn btn-secondary btn-small" onClick={() => setArchived(project, false, stats)}>
                          {t('Restore')}
                        </button>
                        <button className="task-action-btn delete-btn" onClick={() => handleDelete(project)} title={t('Delete')} aria-label={t('Delete')}>
                          <TrashIcon />
                        </button>
                      </span>
                    </div>
                    {shareOpen === project.id && <ProjectShare project={project} onChanged={loadData} onError={setError} />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default ProjectList;
