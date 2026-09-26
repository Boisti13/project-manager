import React, { useState, useEffect } from 'react';
import { highlightParts } from '../taskFilters';
import TaskComments from './TaskComments';
import TaskMenu from './TaskMenu';
import LabelChips from './LabelChips';
import { describeRecurrence, shortRecurrence } from '../recurrence';
import '../styles/TaskItem.css';
import '../styles/Dependencies.css';
import { t, tn, shortDate } from '../i18n';
import { statusName, priorityName } from '../names';

function Highlight({ text, needle }) {
  return highlightParts(text, needle).map((part, i) =>
    part.hit ? <mark key={i}>{part.text}</mark> : <React.Fragment key={i}>{part.text}</React.Fragment>
  );
}

function TaskItem({
  task,
  onEdit,
  onDelete,
  onAddSubtask,
  onReorder,
  isExpanded,
  onToggleExpand,
  onToggleDone,
  onCommentCount,
  childrenOf,
  matchedIds = null,
  searchText = '',
  canDrag = true,
  progressOf = null,
  focusCommentsId = null,
  projectIndex = null,
  getMoveState = null,
  onMove = null,
  onMoveTo = null,
  labelIndex = null,
  onLabelClick = null,
  dependencyIndex = null,
  indent = 0,
}) {
  const subtasks = childrenOf(task);
  const showSubtasks = isExpanded(task.id);
  // While filtering, ancestors shown only for context are dimmed.
  const isContext = matchedIds !== null && !matchedIds.has(task.id);
  const progress = progressOf ? progressOf(task) : { done: 0, total: 0 };
  // All subtasks ticked but the task itself isn't: highlight it, but leave it
  // open -- new subtasks may still be added. Ticking it is a deliberate step.
  const isReady = progress.total > 0 && progress.done === progress.total && task.status !== 'done';
  const openBlockers = dependencyIndex ? dependencyIndex.openBlockersOf(task) : [];
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showComments, setShowComments] = useState(false);
  // Opened from a comment notification.
  useEffect(() => {
    if (focusCommentsId === task.id) setShowComments(true);
  }, [focusCommentsId, task.id]);
  // Text boxes inside a draggable row can't be selected with the mouse.
  const draggableNow = canDrag && !showComments;

  const statusColors = {
    todo: '#999',
    in_progress: '#2196F3',
    blocked: '#FF9800',
    done: '#4CAF50',
  };

  const formatDeadline = (deadline) => (deadline ? shortDate(deadline) : '');

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
      id={`task-${task.id}`}
      className={`task-item ${dragOver ? 'drag-over' : ''} ${dragging ? 'dragging' : ''} ${isContext ? 'task-context' : ''} ${isReady ? 'task-ready' : ''}`}
      style={{ marginLeft: `${indent * 20}px` }}
      draggable={draggableNow}
      {...(draggableNow && {
        onDragStart: handleDragStart,
        onDragEnd: handleDragEnd,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
      })}
    >
      <div className="task-header">
        <div className="task-left">
          {canDrag && (
            <span className="drag-handle" title={t('Drag to reorder')}>
              ⠿
            </span>
          )}
          {subtasks.length > 0 && (
            <button
              className="expand-btn"
              onClick={() => onToggleExpand(task.id)}
              title={showSubtasks ? t('Collapse') : t('Expand')}
            >
              {showSubtasks ? '▼' : '▶'}
            </button>
          )}
          <input
            type="checkbox"
            className="task-done-checkbox"
            checked={task.status === 'done'}
            onChange={() => onToggleDone(task)}
            title={task.status === 'done' ? t('Mark as not done') : t('Mark as done')}
            aria-label={t('Done: {title}', { title: task.title })}
          />
          <div className="task-status-dot" style={{ backgroundColor: statusColors[task.status] }} />
          <span className={`task-title ${task.status === 'done' ? 'task-title-done' : ''}`}>
            <Highlight text={task.title} needle={searchText} />
          </span>
          {labelIndex && <LabelChips labels={labelIndex.of(task)} onClick={onLabelClick} small />}
        </div>

        <div className="task-right">
          {progress.total > 0 && (
            <span
              className={`task-progress ${progress.done === progress.total ? 'complete' : ''}`}
              title={
                isReady
                  ? t("All subtasks done — tick the task when it's finished")
                  : t('{done} of {total} subtasks done', { done: progress.done, total: progress.total })
              }
            >
              {isReady && '✓ '}
              {progress.done}/{progress.total}
            </span>
          )}
          {task.priority > 0 && (
            <span className="task-priority" data-priority={task.priority}>
              {priorityName(task.priority)}
            </span>
          )}
          {openBlockers.length > 0 && (
            <span className="task-waiting" title={t('Waiting for: {tasks}', { tasks: openBlockers.map((b) => b.title).join(', ') })}>
              ⏳ {openBlockers.length === 1 ? t('waiting') : t('waiting · {n}', { n: openBlockers.length })}
            </span>
          )}
          {task.recurrence_unit && (
            <span className="task-repeat" title={describeRecurrence(task.recurrence_unit, task.recurrence_interval)}>
              ↻ {shortRecurrence(task.recurrence_unit, task.recurrence_interval)}
            </span>
          )}
          {task.deadline && (
            <span className={`task-deadline ${isOverdue(task.deadline) ? 'overdue' : ''}`}>
              {formatDeadline(task.deadline)}
            </span>
          )}
          <span className={`task-status-badge status-${task.status}`}>{statusName(task.status)}</span>
          <button
            className={`task-action-btn comment-btn ${showComments ? 'active' : ''}`}
            onClick={() => setShowComments((v) => !v)}
            title={
              task.comment_count
                ? tn(task.comment_count, 'one comment · history', '{n} comments · history')
                : t('Comments & history')
            }
            aria-expanded={showComments}
          >
            💬{task.comment_count > 0 && <span className="comment-count">{task.comment_count}</span>}
          </button>
          <button className="task-action-btn subtask-btn" onClick={() => onAddSubtask(task)} title={t('Add subtask')}>
            +
          </button>
          <button className="task-action-btn edit-btn" onClick={() => onEdit(task)} title={t('Edit')}>
            ✎
          </button>
          <button className="task-action-btn delete-btn" onClick={() => onDelete(task.id)} title={t('Delete')}>
            ✕
          </button>
          {projectIndex && (
            <TaskMenu
              task={task}
              projectIndex={projectIndex}
              moveState={getMoveState ? getMoveState(task) : { up: false, down: false, reorderable: false }}
              onAddSubtask={onAddSubtask}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={onMove}
              onMoveTo={onMoveTo}
            />
          )}
        </div>
      </div>

      {task.description && (
        <p className="task-description">
          <Highlight text={task.description} needle={searchText} />
        </p>
      )}

      {showComments && (
        <TaskComments
          taskId={task.id}
          onCountChange={(n) => onCommentCount?.(task.id, n)}
          changeKey={[
            task.updated_at, task.status, task.title, task.description, task.priority, task.deadline,
            task.assignee_id, task.project_id, task.recurrence_unit, task.recurrence_interval,
            (task.label_ids || []).join(','),
            (task.blocked_by_ids || []).join(','),
          ].join('|')}
        />
      )}

      {showSubtasks && subtasks.length > 0 && (
        <div className="subtasks">
          {subtasks.map((subtask) => (
            <TaskItem
              key={subtask.id}
              task={subtask}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddSubtask={onAddSubtask}
              onReorder={onReorder}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
              onToggleDone={onToggleDone}
              onCommentCount={onCommentCount}
              childrenOf={childrenOf}
              matchedIds={matchedIds}
              searchText={searchText}
              canDrag={canDrag}
              progressOf={progressOf}
              focusCommentsId={focusCommentsId}
              projectIndex={projectIndex}
              getMoveState={getMoveState}
              onMove={onMove}
              onMoveTo={onMoveTo}
              labelIndex={labelIndex}
              onLabelClick={onLabelClick}
              dependencyIndex={dependencyIndex}
              indent={indent + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default TaskItem;
