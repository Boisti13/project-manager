import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import TaskItem from './TaskItem';
import TaskForm from './TaskForm';
import { authFetch, useAuth } from '../context/AuthContext';
import {
  DEFAULT_FILTERS,
  buildTaskTree,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters,
} from '../taskFilters';
import '../styles/TaskList.css';

function TaskList() {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [parentTaskForNew, setParentTaskForNew] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  // Rows the user collapsed even though a filter match auto-expanded them.
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef(null);

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const filtering = hasActiveFilters(filters);

  const setFilter = (key, value) => {
    setSearchParams(filtersToParams({ ...filters, [key]: value }), { replace: true });
    setCollapsedIds(new Set());
  };

  const clearFilters = () => {
    setSearchParams(filtersToParams({ ...DEFAULT_FILTERS, sort: filters.sort }), { replace: true });
    setCollapsedIds(new Set());
  };

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

  useEffect(() => {
    loadData();
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
      const [tasksRes, projectsRes, usersRes] = await Promise.all([
        fetchJson('/api/tasks/'),
        fetchJson('/api/projects/'),
        fetchJson('/api/users/'),
      ]);
      setTasks(tasksRes);
      setProjects(projectsRes);
      setUsers(usersRes);
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
  };

  const handleReorder = async (draggedId, targetId) => {
    const dragged = tasks.find((t) => t.id === draggedId);
    const target = tasks.find((t) => t.id === targetId);
    if (!dragged || !target) return;
    if (dragged.parent_task_id !== target.parent_task_id) return; // only reorder siblings

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

  const tree = useMemo(
    () => buildTaskTree(tasks, filters, { currentUserId: currentUser?.id }),
    [tasks, filters, currentUser]
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

  return (
    <div className="container">
      <div className="task-list-header">
        <div className="header-left">
          <h1>Tasks</h1>
          <span className="task-count">
            ({filtering ? `${visibleRoots.length} of ${tree.totalRoots}` : tree.totalRoots})
          </span>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setSelectedTask(null);
            setParentTaskForNew(null);
            setShowForm(true);
          }}
        >
          + New Task
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <div className="form-container">
          <TaskForm
            task={selectedTask}
            parentTask={parentTaskForNew}
            projects={projects}
            users={users}
            onSubmit={selectedTask ? handleUpdateTask : handleCreateTask}
            onCancel={handleFormCancel}
          />
        </div>
      )}

      <div className="filters">
        <div className="filter-search">
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

        <div className="filter-row">
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
              {projects.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
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

      <div className="task-list">
        {visibleRoots.length === 0 ? (
          <p className="no-tasks">
            {filtering ? 'No tasks match these filters.' : 'No tasks yet.'}
            {filtering && (
              <>
                {' '}
                <button className="link-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              </>
            )}
          </p>
        ) : (
          visibleRoots.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onEdit={handleEditTask}
              onDelete={handleDeleteTask}
              onAddSubtask={handleAddSubtask}
              onReorder={handleReorder}
              isExpanded={isExpanded}
              onToggleExpand={handleToggleExpand}
              childrenOf={tree.childrenOf}
              matchedIds={tree.matchedIds}
              searchText={filters.q}
              canDrag={canDrag}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default TaskList;
