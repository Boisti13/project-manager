import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { buildProjectIndex } from '../projects';
import { searchAll } from '../search';
import { highlightParts } from '../taskFilters';
import { statusName } from '../names';
import { formatDay } from './TaskBoard';
import { t, tn } from '../i18n';
import '../styles/SearchPalette.css';

const Highlight = ({ text, query }) =>
  query
    .trim()
    .split(/\s+/)
    .reduce(
      (parts, word) => parts.flatMap((p) => (p.hit ? [p] : highlightParts(p.text, word))),
      [{ text, hit: false }]
    )
    .map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <React.Fragment key={i}>{p.text}</React.Fragment>));

/**
 * The search window: tasks (title, description, comments) and projects
 * from every page, opened with Ctrl+K / ⌘K or the 🔍 in the top bar.
 * ↑/↓ choose, Enter opens, Esc closes. Something in another workspace
 * switches there first, so it's actually shown.
 */
function SearchPalette({ onClose }) {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null); // { tasks, projects }
  const [commentIds, setCommentIds] = useState(new Set());
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    Promise.all([authFetch('/api/tasks/'), authFetch('/api/projects/')])
      .then(async ([tr, pr]) => setData({ tasks: tr.ok ? await tr.json() : [], projects: pr.ok ? await pr.json() : [] }))
      .catch(() => setData({ tasks: [], projects: [] }));
  }, []);

  // Comments are searched on the server (or in the app's local copy).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setCommentIds(new Set());
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await authFetch(`/api/comments/search?q=${encodeURIComponent(q)}`);
        if (res.ok && !cancelled) setCommentIds(new Set(await res.json()));
      } catch {
        // titles and descriptions still work
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const index = useMemo(() => buildProjectIndex(data?.projects || []), [data]);
  const result = useMemo(
    () => searchAll(query, { tasks: data?.tasks || [], projectIndex: index, commentTaskIds: commentIds }),
    [query, data, index, commentIds]
  );
  const items = [
    ...result.tasks.map((r) => ({ kind: 'task', key: `t${r.task.id}`, ...r })),
    ...result.projects.map((project) => ({ kind: 'project', key: `p${project.id}`, project, projectId: project.id })),
  ];
  const current = Math.min(active, Math.max(items.length - 1, 0));

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('.search-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const open = (item) => {
    // Shown somewhere else? Go to that workspace (or all of them) first.
    const top = item.projectId != null ? index.topOf(item.projectId)?.id ?? null : null;
    if (workspace.scope && !workspace.scope.includes(top)) workspace.setCurrent(workspace.workspaceOf(top)?.id ?? null);
    onClose();
    if (item.kind === 'project') navigate(`/?project=${item.project.id}`);
    else navigate(`/?task=${item.task.id}${item.where === 'comment' ? '&comments=1' : ''}`);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(current + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(current - 1, 0));
    } else if (e.key === 'Enter' && items[current]) {
      e.preventDefault();
      open(items[current]);
    }
  };

  const where = { description: t('in the description'), comment: t('in a comment') };
  return (
    <div className="search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-palette" role="dialog" aria-modal="true" aria-label={t('Search')}>
        <input
          className="search-input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder={t('Search tasks, projects and comments…')}
          aria-label={t('Search tasks, projects and comments…')}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="search-results"
          aria-activedescendant={items[current] ? `search-${items[current].key}` : undefined}
        />
        <ul className="search-results" id="search-results" role="listbox" ref={listRef}>
          {!query.trim() && <li className="search-hint">{t('Type to search everything you can see — also in other workspaces and archived projects.')}</li>}
          {query.trim() && data && items.length === 0 && <li className="search-hint">{t('Nothing found.')}</li>}
          {items.map((item, i) => {
            const isFirstProject = item.kind === 'project' && (i === 0 || items[i - 1].kind !== 'project');
            return (
              <React.Fragment key={item.key}>
                {i === 0 && item.kind === 'task' && <li className="search-group">{t('Tasks')}</li>}
                {isFirstProject && <li className="search-group">{t('Projects')}</li>}
                <li
                  id={`search-${item.key}`}
                  role="option"
                  aria-selected={i === current}
                  className={`search-item ${i === current ? 'active' : ''} ${item.task?.status === 'done' ? 'done' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    open(item);
                  }}
                >
                  {item.kind === 'task' ? (
                    <>
                      <span className="search-title">
                        <span>
                          {item.task.status === 'done' && '✓ '}
                          <Highlight text={item.task.title} query={query} />
                        </span>
                      </span>
                      <span className="search-meta">
                        {[
                          item.projectId != null ? index.labelOf(item.projectId) : t('No project'),
                          item.task.status !== 'done' && item.task.status !== 'todo' ? statusName(item.task.status) : null,
                          item.task.deadline ? formatDay(item.task.deadline) : null,
                          where[item.where],
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="search-title">
                        <span className="search-dot" style={{ backgroundColor: index.colorOf(item.project.id) }} />
                        <span>
                          <Highlight text={index.labelOf(item.project.id)} query={query} />
                        </span>
                      </span>
                      <span className="search-meta">
                        {index.isArchived(item.project.id) ? t('archived') : item.project.parent_id ? t('Category') : t('Project')}
                      </span>
                    </>
                  )}
                </li>
              </React.Fragment>
            );
          })}
          {(result.more.tasks > 0 || result.more.projects > 0) && (
            <li className="search-hint">{tn(result.more.tasks + result.more.projects, 'and one more — type more to narrow it down', 'and {n} more — type more to narrow it down')}</li>
          )}
        </ul>
        <div className="search-keys">
          <span><kbd>↑</kbd> <kbd>↓</kbd> {t('choose')}</span>
          <span><kbd>Enter</kbd> {t('open')}</span>
          <span><kbd>Esc</kbd> {t('close')}</span>
        </div>
      </div>
    </div>
  );
}

export default SearchPalette;
