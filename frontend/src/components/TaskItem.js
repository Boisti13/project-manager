import React, { useState } from 'react';
import '../styles/TaskItem.css';

function TaskItem({ task, onEdit, onDelete, onAddSubtask, onReorder, expandedIds, onToggleExpand, indent = 0 }) {
  const showSubtasks = expandedIds.has(task.id);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);

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

  const handleDragStart = (e) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(task.id));
    setDragging(true);
  };

  const handleDragEnd = (e) => {
    e.stopPropagation();
    setDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!dragOver) setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const draggedId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (draggedId && draggedId !== task.id) {
      onReorder(draggedId, task.id);
    }
  };

  return (
    <div
      className={`task-item ${dragOver ? 'drag-over' : ''} ${dragging ? 'dragging' : ''}`}
      style={{ marginLeft: `${indent * 20}px` }}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="task-header">
        <div className="task-left">
          <span className="drag-handle" title="Drag to reorder">⠿</span>
          {task.subtasks && task.subtasks.length > 0 && (
            <button
              className="expand-btn"
              onClick={() => onToggleExpand(task.id)}
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
          <button className="task-action-btn subtask-btn" onClick={() => onAddSubtask(task)} title="Add Subtask">
            +
          </button>
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
              onAddSubtask={onAddSubtask}
              onReorder={onReorder}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              indent={indent + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default TaskItem;
