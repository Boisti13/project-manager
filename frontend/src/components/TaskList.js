import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TaskItem from './TaskItem';
import TaskForm from './TaskForm';
import TaskBoard from './TaskBoard';
import TaskCalendar from './TaskCalendar';
import { flattenVisible } from '../views';
import { authFetch, useAuth } from '../context/AuthContext';
import {
  DEFAULT_FILTERS,
  buildTaskTree,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters,
} from '../taskFilters';
import { buildProjectIndex, groupTasksByProject, groupTaskCount } from '../projects';
import '../styles/TaskList.css';
import '../styles/TaskViews.css';

const VIEWS = [
  { id: 'list', label: '☰ List' },
  { id: 'board', label: '▦ Board' },
  { id: 'calendar', label: '📅 Calendar' },
];

const COLLAPSED_KEY = 'pm.collapsedGroups';

function loadCollapsedGroups() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function TaskList() {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [archiveAfterDays, setArchiveAfterDays] = useState(null);
  // Expanded "Completed (n)" rows; collapsed by default, not persisted.
  const [openCompleted, setOpenCompleted] = useState(new Set());
  // Set from a notification link (?task=ID&comments=1).
  const [focusCommentsId, setFocusCommentsId] = useState(null);
  // Phones only: the filter selects are folded away behind a button.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Tasks whose comments match the search text (searched server-side).
  const [commentMatchIds, setCommentMatchIds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [parentTaskForNew, setParentTaskForNew] = useState(null);
  const [projectForNew, setProjectForNew] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(loadCollapsedGroups);
  const [expandedIds, setExpandedIds] = useState(new Set());
  // Rows the user collapsed even though a filter match auto-expanded them.
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const searchRef = useRef(null);

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const filtering = hasActiveFilters(filters);

  const setFilter = (key, value) => {
    setSearchParams(filtersToParams({ ...filters, [key]: value }), { replace: true });
    setCollapsedIds(new Set());
  };

  const clearFilters = () => {
    setSearchParams(filtersToParams({ ...DEFAULT_FILTERS, sort: filters.sort, view: filters.view }), { replace: true });
    setCollapsedIds(new Set());
  };

  useEffect(() => {
    const q = filters.q.trim();
    if (!q) {
      setCommentMatchIds(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await authFetch(`/api/comments/search?q=${encodeURIComponent(q)}`);
        if (res.ok && !cancelled) setCommentMatchIds(new Set(await res.json()));
      } catch {
        // search still works on titles/descriptions
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters.q]);

  // "/" focuses the search box (unless already typing somewhere).
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Load once when the page opens.
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setLoading(true);
      const [tasksRes, projectsRes, usersRes, settingsRes] = await Promise.all([
        fetchJson('/api/tasks/'),
        fetchJson('/api/projects/'),
        fetchJson('/api/users/'),
        fetchJson('/api/settings/'),
      ]);
      setTasks(tasksRes);
      setProjects(projectsRes);
      setUsers(usersRes);
      setArchiveAfterDays(settingsRes.archive_after_days);
      setError(null);
    } catch (err) {
      setError('Failed to load data: ' + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (formData) => {
    try {
      await fetchJson('/api/tasks/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (formData.parent_task_id) {
        setExpandedIds((prev) => new Set(prev).add(formData.parent_task_id));
      }
      setShowForm(false);
      setParentTaskForNew(null);
      await loadData();
    } catch (err) {
      setError('Failed to create task: ' + err.message);
    }
  };

  // "Several (one per line)": one request, all tasks or none.
  const handleBulkCreate = async (payload) => {
    try {
      const res = await fetchJson('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Show the new tree: expand the parent and every new task with subtasks.
      const created = new Set(res.ids);
      const hasKids = new Set();
      const walk = (items, ids) => {
        items.forEach((item) => {
          const id = ids.shift();
          if (item.children.length) hasKids.add(id);
          walk(item.children, ids);
        });
      };
      walk(payload.items, [...res.ids]);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (payload.parent_task_id) next.add(payload.parent_task_id);
        hasKids.forEach((id) => created.has(id) && next.add(id));
        return next;
      });
      setShowForm(false);
      setParentTaskForNew(null);
      setProjectForNew(null);
      await loadData();
    } catch (err) {
      setError('Failed to create tasks: ' + err.message);
    }
  };

  const handleUpdateTask = async (formData) => {
    try {
      await fetchJson(`/api/tasks/${selectedTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      setSelectedTask(null);
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError('Failed to update task: ' + err.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task? Subtasks will be deleted too.')) return;
    try {
      const response = await authFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await parseApiError(response));
      await loadData();
    } catch (err) {
      setError('Failed to delete task: ' + err.message);
    }
  };

  // Checkbox: done <-> todo. Updates the row immediately and rolls back if
  // the request fails.
  const handleToggleDone = async (task) => {
    const status = task.status === 'done' ? 'todo' : 'done';
    const previous = tasks;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await fetchJson(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      // A repeating task just created its next occurrence on the server.
      if (status === 'done' && task.recurrence_unit) await loadData();
    } catch (err) {
      setTasks(previous);
      setError('Failed to update task: ' + err.message);
    }
  };

  // Board: move a card to another column.
  const handleSetStatus = async (task, status) => {
    const previous = tasks;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await fetchJson(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      // Reload for completed_at (Done column order) and repeating tasks.
      if (status === 'done' || task.status === 'done') await loadData();
    } catch (err) {
      setTasks(previous);
      setError('Failed to update task: ' + err.message);
    }
  };

  // Calendar: drop a task on another day.
  const handleReschedule = async (task, day) => {
    const previous = tasks;
    const deadline = `${day}T00:00:00`;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, deadline } : t)));
    try {
      await fetchJson(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deadline }),
      });
    } catch (err) {
      setTasks(previous);
      setError('Failed to move the deadline: ' + err.message);
    }
  };

  // Board/Calendar: show a task in the list (same filters).
  const openInList = (task) =>
    setSearchParams({ ...filtersToParams({ ...filters, view: 'list' }), task: String(task.id) }, { replace: true });

  const setView = (view) => setSearchParams(filtersToParams({ ...filters, view }), { replace: true });

  // Siblings a task can swap places with: same parent; for top-level tasks
  // also the same project and the same open/completed section.
  const siblingsOf = (task) =>
    tasks
      .filter(
        (t) =>
          t.parent_task_id === task.parent_task_id &&
          (task.parent_task_id != null ||
            (t.project_id === task.project_id && (t.status === 'done') === (task.status === 'done')))
      )
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);

  const getMoveState = (task) => {
    const reorderable = filters.sort === 'manual';
    if (!reorderable) return { up: false, down: false, reorderable };
    const sibs = siblingsOf(task);
    const i = sibs.findIndex((t) => t.id === task.id);
    return { up: i > 0, down: i >= 0 && i < sibs.length - 1, reorderable };
  };

  const handleMove = (task, dir) => {
    const sibs = siblingsOf(task);
    const target = sibs[sibs.findIndex((t) => t.id === task.id) + dir];
    if (target) handleReorder(task.id, target.id);
  };

  const handleMoveTo = async (task, projectId) => {
    if ((task.project_id ?? null) === projectId) return;
    try {
      await fetchJson(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      await loadData();
      navigate(`/?task=${task.id}`, { replace: true });
    } catch (err) {
      setError('Failed to move task: ' + err.message);
    }
  };

  const handleCommentCount = (taskId, n) =>
    setTasks((ts) => ts.map((t) => (t.id === taskId && t.comment_count !== n ? { ...t, comment_count: n } : t)));

  const handleEditTask = (task) => {
    setSelectedTask(task);
    setParentTaskForNew(null);
    setShowForm(true);
  };

  const handleAddSubtask = (task) => {
    setSelectedTask(null);
    setParentTaskForNew(task);
    setShowForm(true);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setSelectedTask(null);
    setParentTaskForNew(null);
    setProjectForNew(null);
  };

  const openNewTask = (projectId = null) => {
    setSelectedTask(null);
    setParentTaskForNew(null);
    setProjectForNew(projectId);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleGroup = (key) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // per-browser convenience only
      }
      return next;
    });

  const handleReorder = async (draggedId, targetId) => {
    const dragged = tasks.find((t) => t.id === draggedId);
    const target = tasks.find((t) => t.id === targetId);
    if (!dragged || !target) return;
    if (dragged.parent_task_id !== target.parent_task_id) return; // only reorder siblings
    if (dragged.parent_task_id === null && dragged.project_id !== target.project_id) return; // ...within one project

    const siblings = tasks
      .filter((t) => t.parent_task_id === dragged.parent_task_id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);

    const fromIndex = siblings.findIndex((t) => t.id === draggedId);
    const toIndex = siblings.findIndex((t) => t.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const updates = reordered
      .map((t, idx) => ({ id: t.id, order: idx }))
      .filter((u) => siblings.find((s) => s.id === u.id).order !== u.order);

    if (updates.length === 0) return;

    try {
      await Promise.all(
        updates.map((u) =>
          fetchJson(`/api/tasks/${u.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: u.order }),
          })
        )
      );
      await loadData();
    } catch (err) {
      setError('Failed to reorder tasks: ' + err.message);
    }
  };

  const projectIndex = useMemo(() => buildProjectIndex(projects), [projects]);

  const myOpenCount = useMemo(
    () => tasks.filter((t) => t.assignee_id === currentUser?.id && t.status !== 'done').length,
    [tasks, currentUser]
  );

  // Jump to a task from a notification: open everything on the way to it,
  // scroll it into view and flash it; optionally open its comments.
  const focusTaskId = searchParams.get('task');
  useEffect(() => {
    if (!focusTaskId || loading || tasks.length === 0) return;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const target = byId.get(parseInt(focusTaskId, 10));
    const withComments = searchParams.get('comments') === '1';
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    next.delete('comments');
    setSearchParams(next, { replace: true });
    if (!target) {
      setError('That task no longer exists.');
      return;
    }

    let root = target;
    const ancestors = [];
    while (root.parent_task_id != null && byId.has(root.parent_task_id)) {
      root = byId.get(root.parent_task_id);
      ancestors.push(root.id);
    }
    setExpandedIds((prev) => new Set([...prev, ...ancestors]));
    setCollapsedIds(new Set());

    const top = root.project_id != null ? projectIndex.topOf(root.project_id) : null;
    const groupKey = top ? `p${top.id}` : 'none';
    const bucketKey = top && top.id !== root.project_id ? `c${root.project_id}` : groupKey;
    setCollapsedGroups((prev) => {
      const keep = new Set([...prev].filter((k) => k !== groupKey && k !== bucketKey));
      return keep.size === prev.size ? prev : keep;
    });
    if (root.status === 'done') setOpenCompleted((prev) => new Set(prev).add(`${bucketKey}-done`));
    if (withComments) setFocusCommentsId(target.id);

    // Not cleared on re-run: removing ?task= above re-runs this effect, and
    // that must not cancel the scroll.
    setTimeout(() => {
      const el = document.getElementById(`task-${target.id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('task-flash');
      setTimeout(() => el.classList.remove('task-flash'), 2200);
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTaskId, loading, tasks.length]);

  const tree = useMemo(
    () =>
      buildTaskTree(tasks, filters, {
        currentUserId: currentUser?.id,
        projectParentOf: projectIndex.parentIdOf,
        archiveAfterDays,
        commentMatchIds,
      }),
    [tasks, filters, currentUser, projectIndex, archiveAfterDays, commentMatchIds]
  );

  // While filtering, only sections with results are shown; otherwise every
  // project and category is listed so tasks can be added anywhere.
  const groups = useMemo(
    () => groupTasksByProject(tree.roots, projectIndex, { includeEmpty: !filtering }),
    [tree.roots, projectIndex, filtering]
  );

  const toggleIn = (setter, taskId) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  const isExpanded = (taskId) =>
    tree.autoExpandIds.has(taskId) ? !collapsedIds.has(taskId) : expandedIds.has(taskId);

  const handleToggleExpand = (taskId) =>
    toggleIn(tree.autoExpandIds.has(taskId) ? setCollapsedIds : setExpandedIds, taskId);

  if (loading) return <div className="container"><p>Loading tasks...</p></div>;

  const visibleRoots = tree.roots;
  const canDrag = filters.sort === 'manual';

  const renderTask = (task) => (
    <TaskItem
      key={task.id}
      task={task}
      onEdit={handleEditTask}
      onDelete={handleDeleteTask}
      onAddSubtask={handleAddSubtask}
      onReorder={handleReorder}
      isExpanded={isExpanded}
      onToggleExpand={handleToggleExpand}
      onToggleDone={handleToggleDone}
      onCommentCount={handleCommentCount}
      childrenOf={tree.childrenOf}
      matchedIds={tree.matchedIds}
      searchText={filters.q}
      canDrag={canDrag}
      progressOf={tree.progressOf}
      focusCommentsId={focusCommentsId}
      projectIndex={projectIndex}
      getMoveState={getMoveState}
      onMove={handleMove}
      onMoveTo={handleMoveTo}
    />
  );

  // Filtering by status "done" or searching opens the Completed rows, so
  // results are never hidden behind them.
  const completedAutoOpen = filters.status === 'done' || filters.q.trim() !== '';

  const renderCompleted = (key, list) => {
    if (list.length === 0) return null;
    const open = completedAutoOpen || openCompleted.has(key);
    return (
      <div className="completed-group">
        <button
          className="completed-toggle"
          onClick={() => toggleIn(setOpenCompleted, key)}
          aria-expanded={open}
          disabled={completedAutoOpen}
        >
          <span className="project-group-caret">{open ? '▼' : '▶'}</span>✓ Completed ({list.length})
        </button>
        {open && <div className="completed-list">{list.map(renderTask)}</div>}
      </div>
    );
  };

  return (
    <div className="container">
      <div className="task-list-header">
        <div className="header-left">
          <h1>Tasks</h1>
          <span className="task-count">
            ({filtering ? `${visibleRoots.length} of ${tree.totalRoots}` : tree.totalRoots})
          </span>
        </div>
        <div className="header-actions tasks-header-actions">
          <div className="view-switch" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={filters.view === v.id ? 'active' : ''}
                aria-pressed={filters.view === v.id}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => openNewTask(filters.project ? parseInt(filters.project, 10) : null)}
          >
            + New Task
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <div className="form-container">
          <TaskForm
            key={`${selectedTask?.id}-${parentTaskForNew?.id}-${projectForNew}`}
            task={selectedTask}
            parentTask={parentTaskForNew}
            defaultProjectId={projectForNew}
            projectIndex={projectIndex}
            users={users}
            onSubmit={selectedTask ? handleUpdateTask : handleCreateTask}
            onBulkSubmit={handleBulkCreate}
            onCancel={handleFormCancel}
          />
        </div>
      )}

      <div className="filters">
        <div className="filter-search">
          <button
            className={`mine-toggle ${filters.assignee === 'me' ? 'active' : ''}`}
            onClick={() => setFilter('assignee', filters.assignee === 'me' ? '' : 'me')}
            aria-pressed={filters.assignee === 'me'}
            title="Show only tasks assigned to you"
          >
            Assigned to me{myOpenCount > 0 && <span className="mine-count">{myOpenCount}</span>}
          </button>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search tasks…  ( / )"
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilter('q', '');
                e.target.blur();
              }
            }}
            aria-label="Search tasks"
          />
        </div>

        <button
          className="btn btn-secondary btn-small filters-toggle"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          {filtersOpen ? '▲' : '▼'} Filters & sort
          {filters.status !== 'all' || filters.project || filters.assignee || filters.due || filters.sort !== 'manual'
            ? ' •'
            : ''}
        </button>

        <div className={`filter-row ${filtersOpen ? 'open' : ''}`}>
          <div className="filter-group">
            <label htmlFor="f-status">Status</label>
            <select id="f-status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="all">All</option>
              <option value="open">Not done</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="f-project">Project</label>
            <select id="f-project" value={filters.project} onChange={(e) => setFilter('project', e.target.value)}>
              <option value="">All</option>
              {projectIndex.topLevel.map((p) => [
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>,
                ...projectIndex.categoriesOf(p.id).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {'\u00a0\u00a0\u00a0└ '}
                    {c.name}
                  </option>
                )),
              ])}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="f-assignee">Assignee</label>
            <select id="f-assignee" value={filters.assignee} onChange={(e) => setFilter('assignee', e.target.value)}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="none">Unassigned</option>
              {users
                .filter((u) => u.id !== currentUser?.id)
                .map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.username}
                  </option>
                ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="f-due">Deadline</label>
            <select id="f-due" value={filters.due} onChange={(e) => setFilter('due', e.target.value)}>
              <option value="">Any</option>
              <option value="overdue">Overdue</option>
              <option value="week">Due in 7 days</option>
              <option value="none">No deadline</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="f-sort">Sort</label>
            <select id="f-sort" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>
              <option value="manual">Manual order</option>
              <option value="deadline">Deadline</option>
              <option value="priority">Priority</option>
              <option value="created">Newest first</option>
              <option value="title">Title</option>
            </select>
          </div>

          {filtering && (
            <button className="btn btn-secondary btn-small filter-clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {tree.archivedCount > 0 && (
        <p className="archive-note">
          {tree.archivedCount} task{tree.archivedCount === 1 ? '' : 's'} completed more than {archiveAfterDays}{' '}
          {archiveAfterDays === 1 ? 'day' : 'days'} ago {tree.archivedCount === 1 ? 'is' : 'are'} archived.{' '}
          <button className="link-btn" onClick={() => setFilter('status', 'done')}>
            Show done tasks
          </button>{' '}
          or search to find them.
        </p>
      )}

      {filters.view === 'board' && (
        <TaskBoard
          roots={visibleRoots}
          projectIndex={projectIndex}
          users={users}
          progressOf={tree.progressOf}
          onSetStatus={handleSetStatus}
          onOpen={openInList}
          onEdit={(task) => {
            handleEditTask(task);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {filters.view === 'calendar' && (
        <TaskCalendar
          tasks={flattenVisible(tree)}
          projectIndex={projectIndex}
          onOpen={openInList}
          onReschedule={handleReschedule}
        />
      )}

      {filters.view !== 'board' && filters.view !== 'calendar' && (
      <div className="task-list">
        {visibleRoots.length === 0 && filtering ? (
          <p className="no-tasks">
            No tasks match these filters.{' '}
            <button className="link-btn" onClick={clearFilters}>
              Clear filters
            </button>
          </p>
        ) : groups.length === 0 ? (
          <p className="no-tasks">No tasks or projects yet.</p>
        ) : (
          groups.map((group) => {
            // Filters auto-open sections so results are never hidden.
            const collapsed = !filtering && collapsedGroups.has(group.key);
            return (
              <section
                key={group.key}
                className={`project-group ${collapsed ? 'collapsed' : ''}`}
                style={{ '--project-color': group.color }}
              >
                <header className="project-group-header">
                  <button
                    className="project-group-toggle"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={!collapsed}
                    disabled={filtering}
                  >
                    <span className="project-group-caret">{collapsed ? '▶' : '▼'}</span>
                    <span className="project-swatch" />
                    <span className="project-group-name">{group.project ? group.project.name : 'No project'}</span>
                    <span className="project-group-count">{groupTaskCount(group)}</span>
                  </button>
                  <button
                    className="task-action-btn"
                    title={group.project ? `New task in ${group.project.name}` : 'New task without project'}
                    onClick={() => openNewTask(group.project ? group.project.id : null)}
                  >
                    +
                  </button>
                </header>

                {!collapsed && (
                  <div className="project-group-body">
                    {group.tasks.map(renderTask)}
                    {renderCompleted(`${group.key}-done`, group.completed)}
                    {group.categories.map((cat) => {
                      const catCollapsed = !filtering && collapsedGroups.has(cat.key);
                      return (
                      <div className={`category-group ${catCollapsed ? 'collapsed' : ''}`} key={cat.key}>
                        <div className="category-header">
                          <button
                            className="category-toggle"
                            onClick={() => toggleGroup(cat.key)}
                            aria-expanded={!catCollapsed}
                            disabled={filtering}
                          >
                            <span className="project-group-caret">{catCollapsed ? '▶' : '▼'}</span>
                            <span className="category-name">{cat.project.name}</span>
                            <span className="project-group-count">{cat.tasks.length}</span>
                          </button>
                          <button
                            className="task-action-btn"
                            title={`New task in ${group.project.name} / ${cat.project.name}`}
                            onClick={() => openNewTask(cat.project.id)}
                          >
                            +
                          </button>
                        </div>
                        {!catCollapsed && (
                          <>
                            {cat.tasks.length === 0 ? (
                              <p className="category-empty">{cat.completed.length ? 'All done ✓' : 'No tasks'}</p>
                            ) : (
                              cat.tasks.map(renderTask)
                            )}
                            {renderCompleted(`${cat.key}-done`, cat.completed)}
                          </>
                        )}
                      </div>
                      );
                    })}
                    {group.tasks.length === 0 && group.categories.length === 0 && group.completed.length === 0 && (
                      <p className="category-empty">No tasks</p>
                    )}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
      )}
    </div>
  );
}

export default TaskList;
