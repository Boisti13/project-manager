import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authFetch } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { buildProjectIndex } from '../projects';
import { parseServerDate } from '../taskFilters';
import { useSyncRefresh } from '../desktop/useSyncRefresh';
import { t, tn, locale } from '../i18n';
import '../styles/MindMap.css';

// The mind maps of all projects in the current workspace (or of one:
// ?project=ID), and a form to start a new one.
function MindMaps() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const projectFilter = params.get('project') ? Number(params.get('project')) : null;
  const [maps, setMaps] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(projectFilter ? String(projectFilter) : '');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const get = async (url) => {
        const r = await authFetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      };
      const [m, p] = await Promise.all([get('/api/mindmaps/'), get('/api/projects/')]);
      setMaps(m);
      setProjects(p);
      setError(null);
    } catch (err) {
      setError(t('Could not load the mind maps: {error}', { error: err.message }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useSyncRefresh(load);

  const { scope } = useWorkspace();
  const index = useMemo(() => buildProjectIndex(projects, scope), [projects, scope]);

  const projectName = (id) => {
    const p = index.byId.get(id);
    if (!p) return '';
    const top = index.topOf(id);
    return top && top.id !== id ? `${top.name} › ${p.name}` : p.name;
  };
  const projectColor = (id) => index.topOf(id)?.color || 'var(--color-primary)';

  // Projects and their categories to choose from.
  const choices = index.topLevel.flatMap((p) => [
    { id: p.id, label: p.name },
    ...index.categoriesOf(p.id).map((c) => ({ id: c.id, label: `${p.name} › ${c.name}` })),
  ]);

  const shown = (maps || []).filter((m) => {
    if (!index.inScope(m.project_id)) return false;
    if (projectFilter == null) return true;
    return m.project_id === projectFilter || index.topOf(m.project_id)?.id === projectFilter;
  });

  // Grouped by top-level project, in the project list's order.
  const groups = [];
  for (const p of [...index.topLevel, ...index.archived]) {
    const list = shown.filter((m) => index.topOf(m.project_id)?.id === p.id);
    if (list.length) groups.push({ project: p, maps: list });
  }

  const create = async (e) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    setCreating(true);
    try {
      const r = await authFetch('/api/mindmaps/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), project_id: Number(projectId), nodes: [] }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${r.status}`);
      navigate(`/mindmaps/${data.id}`);
    } catch (err) {
      setError(t('Could not create the mind map: {error}', { error: err.message }));
      setCreating(false);
    }
  };

  const when = (m) =>
    parseServerDate(m.updated_at)?.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) || '';

  return (
    <div className="container mindmaps">
      <div className="task-list-header">
        <div className="header-left">
          <h1>{t('Mind maps')}</h1>
          {maps && <span className="task-count">{tn(shown.length, 'one map', '{n} maps')}</span>}
        </div>
        {projectFilter != null && (
          <button className="btn btn-secondary btn-small" onClick={() => setParams({})}>
            {t('All projects')}
          </button>
        )}
      </div>
      <p className="mindmaps-intro">
        {t('Collect ideas around a topic, sort them into branches, and turn the good ones into tasks.')}
      </p>

      <form className="mindmaps-new" onSubmit={create}>
        <input
          type="text"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('Topic of the new mind map')}
          aria-label={t('Topic of the new mind map')}
        />
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label={t('Project')} required>
          <option value="">{t('Project…')}</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit" disabled={creating || !title.trim() || !projectId}>
          {t('+ Mind map')}
        </button>
      </form>

      {error && <p className="error-message">{error}</p>}
      {maps === null && !error && <p className="mindmaps-empty">{t('Loading…')}</p>}
      {maps && shown.length === 0 && <p className="mindmaps-empty">{t('No mind maps yet.')}</p>}

      {groups.map(({ project, maps: list }) => (
        <section key={project.id} className="mindmaps-group">
          <h2>
            <span className="mindmaps-dot" style={{ background: project.color || 'var(--color-primary)' }} />
            {project.name} <span className="project-group-count">{list.length}</span>
          </h2>
          <ul className="mindmaps-list">
            {list.map((m) => (
              <li key={m.id}>
                <Link to={`/mindmaps/${m.id}`} className="mindmaps-card" style={{ borderLeftColor: projectColor(m.project_id) }}>
                  <strong>{m.title}</strong>
                  <span className="mindmaps-meta">
                    {m.project_id !== project.id && <span>{projectName(m.project_id)} · </span>}
                    {tn(m.node_count, 'one idea', '{n} ideas')} · {when(m)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default MindMaps;
