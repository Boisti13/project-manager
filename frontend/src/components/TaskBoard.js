import React, { useState } from 'react';
import { BOARD_COLUMNS, boardColumns } from '../views';
import { shortRecurrence } from '../recurrence';
import LabelChips from './LabelChips';
import '../styles/TaskViews.css';
import '../styles/Dependencies.css';
import { t, shortDate } from '../i18n';
import { statusName, priorityName } from '../names';

const DONE_SHOWN = 15;

export const formatDay = (deadline) => shortDate(deadline);

export const isOverdue = (task) => !!task.deadline && task.status !== 'done' && new Date(task.deadline) < new Date();

// Kanban board of the top-level tasks the list would show. Cards move
// between columns by drag and drop, or with the ◀ ▶ buttons (touch).
function TaskBoard({
  roots,
  projectIndex,
  users,
  progressOf,
  onSetStatus,
  onOpen,
  onEdit,
  labelIndex,
  onLabelClick,
  dependencyIndex,
}) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const cols = boardColumns(roots);
  const userName = (id) => users.find((u) => u.id === id)?.username;

  const drop = (status) => (e) => {
    e.preventDefault();
    setOverCol(null);
    const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const task = roots.find((t) => t.id === id);
    if (task && task.status !== status) onSetStatus(task, status);
    setDragId(null);
  };

  const card = (task, colIndex) => {
    const project = task.project_id != null ? projectIndex.byId.get(task.project_id) : null;
    const progress = progressOf(task);
    const openBlockers = dependencyIndex ? dependencyIndex.openBlockersOf(task) : [];
    const prev = BOARD_COLUMNS[colIndex - 1];
    const next = BOARD_COLUMNS[colIndex + 1];
    return (
      <li
        key={task.id}
        className={`board-card ${dragId === task.id ? 'dragging' : ''} ${task.status === 'done' ? 'done' : ''}`}
        style={{ '--project-color': projectIndex.colorOf(task.project_id) }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(task.id));
          setDragId(task.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverCol(null);
        }}
      >
        <button className="board-card-title" onClick={() => onOpen(task)} title={t('Show in the list')}>
          {task.title}
        </button>
        {project && (
          <span className="board-card-project">
            {projectIndex.labelOf(project.id)}
          </span>
        )}
        {labelIndex && <LabelChips labels={labelIndex.of(task)} onClick={onLabelClick} small />}
        <span className="board-card-meta">
          {task.priority > 0 && (
            <span className="task-priority" data-priority={task.priority}>
              {priorityName(task.priority)}
            </span>
          )}
          {task.deadline && (
            <span className={`task-deadline ${isOverdue(task) ? 'overdue' : ''}`}>{formatDay(task.deadline)}</span>
          )}
          {openBlockers.length > 0 && (
            <span className="task-waiting" title={t('Waiting for: {tasks}', { tasks: openBlockers.map((b) => b.title).join(', ') })}>
              ⏳ {openBlockers.length === 1 ? t('waiting') : t('waiting · {n}', { n: openBlockers.length })}
            </span>
          )}
          {task.recurrence_unit && (
            <span className="task-repeat">↻ {shortRecurrence(task.recurrence_unit, task.recurrence_interval)}</span>
          )}
          {progress.total > 0 && (
            <span className="board-chip" title={t('Subtasks done')}>
              ☑ {progress.done}/{progress.total}
            </span>
          )}
          {task.comment_count > 0 && <span className="board-chip">💬 {task.comment_count}</span>}
          {task.assignee_id && <span className="board-chip board-assignee">@{userName(task.assignee_id) || '?'}</span>}
        </span>
        <span className="board-card-actions">
          <button
            className="task-action-btn"
            disabled={!prev}
            onClick={() => prev && onSetStatus(task, prev.status)}
            title={prev ? t('Move to {status}', { status: statusName(prev.status) }) : ''}
            aria-label={prev ? t('Move to {status}', { status: statusName(prev.status) }) : t('First column')}
          >
            ◀
          </button>
          <button className="task-action-btn" onClick={() => onEdit(task)} title={t('Edit')} aria-label={t('Edit')}>
            ✎
          </button>
          <button
            className="task-action-btn"
            disabled={!next}
            onClick={() => next && onSetStatus(task, next.status)}
            title={next ? t('Move to {status}', { status: statusName(next.status) }) : ''}
            aria-label={next ? t('Move to {status}', { status: statusName(next.status) }) : t('Last column')}
          >
            ▶
          </button>
        </span>
      </li>
    );
  };

  return (
    <div className="board">
      {BOARD_COLUMNS.map((col, i) => {
        let list = cols[col.status];
        const hidden = col.status === 'done' && !showAllDone ? Math.max(0, list.length - DONE_SHOWN) : 0;
        if (hidden) list = list.slice(0, DONE_SHOWN);
        return (
          <section
            key={col.status}
            className={`board-column status-${col.status} ${overCol === col.status ? 'drop-target' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overCol !== col.status) setOverCol(col.status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null);
            }}
            onDrop={drop(col.status)}
          >
            <h2 className="board-column-title">
              {statusName(col.status)} <span className="project-group-count">{cols[col.status].length}</span>
            </h2>
            <ul className="board-cards">
              {list.map((t) => card(t, i))}
              {list.length === 0 && <li className="board-empty">{t('Nothing here')}</li>}
            </ul>
            {hidden > 0 && (
              <button className="link-btn board-more" onClick={() => setShowAllDone(true)}>
                {t('Show {n} more', { n: hidden })}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default TaskBoard;
