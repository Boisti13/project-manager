import React, { useState } from 'react';
import '../styles/TaskItem.css';

function TaskItem({ task, onEdit, onDelete, onStatusChange, onSelectSubtasks, indent = 0 }) {
  const [showSubtasks, setShowSubtasks] = useState(false);

  const statusColors = {
    todo: '#999',
    in_progress: '#2196F3',
    blocked: '#FF9800',
    done: '#4CAF50',
  };

  const priorityLabels = {
    0: 'Low',
    1: 'Medium',
    2: 'High',
    3: 'Critical',
  };

  const formatDeadline = (deadline) => {
    if (!deadline) return '';
    const date = new Date(deadline);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isOverdue = (deadline) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date() && task.status !== 'done';
  };

  return (
    <div className="task-item" style={{ marginLeft: `${indent * 20}px` }}>
      <div className="task-header">
        <div className="task-left">
          {task.subtasks && task.subtasks.length > 0 && (
            <button
              className="expand-btn"
              onClick={() => setShowSubtasks(!showSubtasks)}
              title={showSubtasks ? 'Collapse' : 'Expand'}
            >
              {showSubtasks ? '▼' : '▶'}
            </button>
          )}
          <div className="task-status-dot" style={{ backgroundColor: statusColors[task.status] }} />
          <span className="task-title">{task.title}</span>
        </div>

        <div className="task-right">
          {task.priority > 0 && (
            <span className="task-priority" data-priority={task.priority}>
              {priorityLabels[task.priority] || 'P' + task.priority}
            </span>
          )}
          {task.deadline && (
            <span className={`task-deadline ${isOverdue(task.deadline) ? 'overdue' : ''}`}>
              {formatDeadline(task.deadline)}
            </span>
          )}
          <span className={`task-status-badge status-${task.status}`}>{task.status.replace('_', ' ')}</span>
          <button className="task-action-btn edit-btn" onClick={() => onEdit(task)} title="Edit">
            ✎
          </button>
          <button className="task-action-btn delete-btn" onClick={() => onDelete(task.id)} title="Delete">
            ✕
          </button>
        </div>
      </div>

      {task.description && <p className="task-description">{task.description}</p>}

      {showSubtasks && task.subtasks && task.subtasks.length > 0 && (
        <div className="subtasks">
          {task.subtasks.map((subtask) => (
            <TaskItem
              key={subtask.id}
              task={subtask}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              indent={indent + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default TaskItem;
