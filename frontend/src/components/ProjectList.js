import React, { useState, useEffect } from 'react';
import ProjectForm from './ProjectForm';
import '../styles/TaskList.css';
import '../styles/ProjectList.css';

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
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json();
};

function ProjectList() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const res = await fetchJson('/api/projects/');
      setProjects(res);
      setError(null);
    } catch (err) {
      setError('Failed to load projects: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (formData) => {
    try {
      const res = await fetchJson('/api/projects/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      setProjects([...projects, res]);
      setShowForm(false);
      setError(null);
    } catch (err) {
      setError('Failed to create project: ' + err.message);
    }
  };

  const handleUpdate = async (formData) => {
    try {
      const res = await fetchJson(`/api/projects/${selectedProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      setProjects(projects.map((p) => (p.id === selectedProject.id ? res : p)));
      setSelectedProject(null);
      setShowForm(false);
      setError(null);
    } catch (err) {
      setError('Failed to update project: ' + err.message);
    }
  };

  const handleDelete = async (projectId) => {
    if (!window.confirm('Delete this project? Tasks assigned to it will remain but become unassigned from any project.')) return;
    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await parseApiError(response));
      setProjects(projects.filter((p) => p.id !== projectId));
      setError(null);
    } catch (err) {
      setError('Failed to delete project: ' + err.message);
    }
  };

  const handleEdit = (project) => {
    setSelectedProject(project);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setSelectedProject(null);
  };

  if (loading) return <div className="container"><p>Loading projects...</p></div>;

  return (
    <div className="container">
      <div className="task-list-header">
        <div className="header-left">
          <h1>Projects</h1>
          <span className="task-count">({projects.length})</span>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setSelectedProject(null);
            setShowForm(true);
          }}
        >
          + New Project
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <div className="form-container">
          <ProjectForm
            project={selectedProject}
            onSubmit={selectedProject ? handleUpdate : handleCreate}
            onCancel={handleCancel}
          />
        </div>
      )}

      <div className="project-list">
        {projects.length === 0 ? (
          <p className="no-tasks">No projects found</p>
        ) : (
          projects.map((project) => (
            <div className="project-item" key={project.id}>
              <div className="project-header">
                <span className="project-name">{project.name}</span>
                <div className="project-actions">
                  <button className="task-action-btn edit-btn" onClick={() => handleEdit(project)} title="Edit">
                    ✎
                  </button>
                  <button className="task-action-btn delete-btn" onClick={() => handleDelete(project.id)} title="Delete">
                    ✕
                  </button>
                </div>
              </div>
              {project.description && <p className="project-description">{project.description}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ProjectList;
