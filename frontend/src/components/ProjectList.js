import React, { useState, useEffect, useMemo } from 'react';
import ProjectForm from './ProjectForm';
import { authFetch } from '../context/AuthContext';
import { buildProjectIndex } from '../projects';
import '../styles/TaskList.css';
import '../styles/ProjectList.css';

function ProjectList() {
  const [projects, setProjects] = useState([]);
  const [taskCounts, setTaskCounts] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // null: closed; { project } to edit; { parentId } to create
  const [form, setForm] = useState(null);

  const projectIndex = useMemo(() => buildProjectIndex(projects), [projects]);

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
      const [projectsRes, tasksRes] = await Promise.all([fetchJson('/api/projects/'), fetchJson('/api/tasks/')]);
      setProjects(projectsRes);
      const counts = new Map();
      for (const t of tasksRes) {
        if (t.project_id != null && t.parent_task_id == null) counts.set(t.project_id, (counts.get(t.project_id) || 0) + 1);
      }
      setTaskCounts(counts);
      setError(null);
    } catch (err) {
      setError('Failed to load projects: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (formData) => {
    try {
      if (form.project) {
        await fetchJson(`/api/projects/${form.project.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      } else {
        await fetchJson('/api/projects/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      }
      setForm(null);
      await loadData();
    } catch (err) {
      setError('Failed to save: ' + err.message);
    }
  };

  const handleDelete = async (project) => {
    const categories = projectIndex.categoriesOf(project.id);
    const msg = categories.length
      ? `Delete "${project.name}" and its ${categories.length} ${categories.length === 1 ? 'category' : 'categories'}? Their tasks are kept but will no longer belong to a project.`
      : `Delete "${project.name}"? Its tasks are kept but will no longer belong to a project.`;
    if (!window.confirm(msg)) return;
    try {
      const response = await authFetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await parseApiError(response));
      await loadData();
    } catch (err) {
      setError('Failed to delete: ' + err.message);
    }
  };

  const openForm = (value) => {
    setForm(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <div className="container"><p>Loading projects...</p></div>;

  const count = (id) => taskCounts.get(id) || 0;

  return (
    <div className="container">
      <div className="task-list-header">
        <div className="header-left">
          <h1>Projects</h1>
          <span className="task-count">({projectIndex.topLevel.length})</span>
        </div>
        <button className="btn btn-primary" onClick={() => openForm({ parentId: null })}>
          + New Project
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {form && (
        <div className="form-container">
          <ProjectForm
            key={form.project ? `e${form.project.id}` : `n${form.parentId}`}
            project={form.project || null}
            defaultParentId={form.parentId ?? null}
            projectIndex={projectIndex}
            onSubmit={handleSubmit}
            onCancel={() => setForm(null)}
          />
        </div>
      )}

      <div className="project-list">
        {projectIndex.topLevel.length === 0 ? (
          <p className="no-tasks">No projects yet</p>
        ) : (
          projectIndex.topLevel.map((project) => {
            const categories = projectIndex.categoriesOf(project.id);
            const total = count(project.id) + categories.reduce((n, c) => n + count(c.id), 0);
            return (
              <div className="project-item" key={project.id} style={{ '--project-color': projectIndex.colorOf(project.id) }}>
                <div className="project-row">
                  <span className="project-swatch" />
                  <div className="project-info">
                    <h3>
                      {project.name} <span className="project-group-count">{total}</span>
                    </h3>
                    {project.description && <p>{project.description}</p>}
                  </div>
                  <div className="project-actions">
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => openForm({ parentId: project.id })}
                      title="Add a category (sub-project)"
                    >
                      + Category
                    </button>
                    <button className="task-action-btn edit-btn" onClick={() => openForm({ project })} title="Edit">
                      ✎
                    </button>
                    <button className="task-action-btn delete-btn" onClick={() => handleDelete(project)} title="Delete">
                      ✕
                    </button>
                  </div>
                </div>

                {categories.length > 0 && (
                  <ul className="category-list">
                    {categories.map((c) => (
                      <li key={c.id} className="category-row">
                        <span className="category-name">{c.name}</span>
                        <span className="project-group-count">{count(c.id)}</span>
                        {c.description && <span className="category-desc">{c.description}</span>}
                        <span className="project-actions">
                          <button className="task-action-btn edit-btn" onClick={() => openForm({ project: c })} title="Edit">
                            ✎
                          </button>
                          <button className="task-action-btn delete-btn" onClick={() => handleDelete(c)} title="Delete">
                            ✕
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
    </div>
  );
}

export default ProjectList;
