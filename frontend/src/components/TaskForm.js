import React, { useState, useEffect } from 'react';
import '../styles/TaskForm.css';

function TaskForm({ task, parentTask, projects, users, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 0,
    deadline: '',
    project_id: parentTask ? parentTask.project_id || null : null,
    assignee_id: null,
    parent_task_id: parentTask ? parentTask.id : null,
  });

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'todo',
        priority: task.priority || 0,
        deadline: task.deadline ? task.deadline.split('T')[0] : '',
        project_id: task.project_id || null,
        assignee_id: task.assignee_id || null,
        parent_task_id: task.parent_task_id || null,
      });
    }
  }, [task]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'priority' || name === 'project_id' || name === 'assignee_id'
        ? (value === '' ? null : parseInt(value, 10))
        : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      deadline: formData.deadline ? formData.deadline : null,
    });
  };

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      {parentTask && (
        <div className="subtask-of-banner">
          Subtask of: <strong>{parentTask.title}</strong>
        </div>
      )}

      <div className="form-group">
        <label>Title *</label>
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleChange}
          required
          placeholder="Enter task title"
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Task description"
          rows="3"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Status</label>
          <select name="status" value={formData.status} onChange={handleChange}>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>
        </div>

        <div className="form-group">
          <label>Priority</label>
          <input
            type="number"
            name="priority"
            value={formData.priority}
            onChange={handleChange}
            min="0"
            max="10"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Deadline</label>
          <input
            type="date"
            name="deadline"
            value={formData.deadline}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Project</label>
          <select name="project_id" value={formData.project_id || ''} onChange={handleChange}>
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>Assign To</label>
        <select name="assignee_id" value={formData.assignee_id || ''} onChange={handleChange}>
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
            </option>
          ))}
        </select>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {task ? 'Update Task' : 'Create Task'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default TaskForm;
