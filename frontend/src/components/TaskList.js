import React, { useState, useEffect } from 'react';
import TaskItem from './TaskItem';
import TaskForm from './TaskForm';
import { authFetch, useAuth } from '../context/AuthContext';
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
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProject, setFilterProject] = useState(null);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());

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

  const handleToggleExpand = (taskId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const getFilteredTasks = () => {
    let filtered = tasks.filter((t) => t.parent_task_id === null); // Only root tasks

    if (filterStatus !== 'all') {
      filtered = filtered.filter((t) => t.status === filterStatus);
    }

    if (filterProject) {
      filtered = filtered.filter((t) => t.project_id === filterProject);
    }

    if (myTasksOnly && currentUser) {
      filtered = filtered.filter((t) => t.assignee_id === currentUser.id);
    }

    return filtered;
  };

  if (loading) return <div className="container"><p>Loading tasks...</p></div>;

  const filteredTasks = getFilteredTasks();

  return (
    <div className="container">
      <div className="task-list-header">
        <div className="header-left">
          <h1>Tasks</h1>
          <span className="task-count">({filteredTasks.length})</span>
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
        <div className="filter-group">
          <label>Status:</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Project:</label>
          <select value={filterProject || ''} onChange={(e) => setFilterProject(e.target.value ? parseInt(e.target.value, 10) : null)}>
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group filter-checkbox">
          <label>
            <input
              type="checkbox"
              checked={myTasksOnly}
              onChange={(e) => setMyTasksOnly(e.target.checked)}
            />
            My Tasks Only
          </label>
        </div>
      </div>

      <div className="task-list">
        {filteredTasks.length === 0 ? (
          <p className="no-tasks">No tasks found</p>
        ) : (
          filteredTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onEdit={handleEditTask}
              onDelete={handleDeleteTask}
              onAddSubtask={handleAddSubtask}
              onReorder={handleReorder}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default TaskList;
