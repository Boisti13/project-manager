import React, { useState, useEffect } from 'react';
import TaskItem from './TaskItem';
import TaskForm from './TaskForm';
import '../styles/TaskList.css';

function TaskList() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProject, setFilterProject] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksRes, projectsRes, usersRes] = await Promise.all([
        fetch('/api/tasks/').then(r => r.json()),
        fetch('/api/projects/').then(r => r.json()),
        fetch('/api/users/').then(r => r.json()),
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
      const res = await fetch('/api/tasks/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      }).then(r => r.json());
      setTasks([...tasks, res]);
      setShowForm(false);
      setError(null);
    } catch (err) {
      setError('Failed to create task: ' + err.message);
    }
  };

  const handleUpdateTask = async (formData) => {
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      }).then(r => r.json());
      setTasks(tasks.map((t) => (t.id === selectedTask.id ? res : t)));
      setSelectedTask(null);
      setShowForm(false);
      setError(null);
    } catch (err) {
      setError('Failed to update task: ' + err.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      setTasks(tasks.filter((t) => t.id !== taskId));
      setError(null);
    } catch (err) {
      setError('Failed to delete task: ' + err.message);
    }
  };

  const handleEditTask = (task) => {
    setSelectedTask(task);
    setShowForm(true);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setSelectedTask(null);
  };

  const getFilteredTasks = () => {
    let filtered = tasks.filter((t) => t.parent_task_id === null); // Only root tasks

    if (filterStatus !== 'all') {
      filtered = filtered.filter((t) => t.status === filterStatus);
    }

    if (filterProject) {
      filtered = filtered.filter((t) => t.project_id === filterProject);
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
            />
          ))
        )}
      </div>
    </div>
  );
}

export default TaskList;
