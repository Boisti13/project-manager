import React, { useState, useEffect, useRef } from 'react';
import '../styles/TaskMenu.css';
import { t } from '../i18n';

// "⋯" menu on a task row: add subtask, edit, move to another project/category,
// move up/down (manual order), delete. On phones it replaces the row's
// individual buttons.
function TaskMenu({ task, projectIndex, moveState, onAddSubtask, onEdit, onDelete, onMove, onMoveTo }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('main'); // 'main' | 'move'
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const run = (fn) => () => {
    setOpen(false);
    fn();
  };

  const { up, down, reorderable } = moveState;

  return (
    <div className="task-menu" ref={ref} onDragStart={(e) => e.stopPropagation()}>
      <button
        className="task-action-btn menu-btn"
        onClick={() => {
          setView('main');
          setOpen((o) => !o);
        }}
        title={t('More actions')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && view === 'main' && (
        <div className="task-menu-list" role="menu">
          <button role="menuitem" onClick={run(() => onAddSubtask(task))}>
            <span className="tm-icon">＋</span> {t('Add subtask')}
          </button>
          <button role="menuitem" onClick={run(() => onEdit(task))}>
            <span className="tm-icon">✎</span> {t('Edit')}
          </button>
          <button role="menuitem" onClick={() => setView('move')}>
            <span className="tm-icon">⇢</span> {t('Move to…')}
          </button>
          <button
            role="menuitem"
            onClick={run(() => onMove(task, -1))}
            disabled={!up}
            title={reorderable ? '' : t('Switch the sort to “Manual order” to reorder')}
          >
            <span className="tm-icon">↑</span> {t('Move up')}
          </button>
          <button
            role="menuitem"
            onClick={run(() => onMove(task, 1))}
            disabled={!down}
            title={reorderable ? '' : t('Switch the sort to “Manual order” to reorder')}
          >
            <span className="tm-icon">↓</span> {t('Move down')}
          </button>
          <button role="menuitem" className="tm-danger" onClick={run(() => onDelete(task.id))}>
            <span className="tm-icon">✕</span> {t('Delete')}
          </button>
        </div>
      )}
      {open && view === 'move' && (
        <div className="task-menu-list task-menu-move" role="menu">
          <div className="tm-head">
            <button className="tm-back" onClick={() => setView('main')} aria-label={t('Back')}>
              ←
            </button>
            {t('Move “{title}” to', { title: task.title })}
          </div>
          <div className="tm-scroll">
            <button
              role="menuitemradio"
              aria-checked={task.project_id == null}
              className={task.project_id == null ? 'tm-current' : ''}
              onClick={run(() => onMoveTo(task, null))}
            >
              {t('No project')}
            </button>
            {projectIndex.topLevel.map((p) => [
              <button
                key={p.id}
                role="menuitemradio"
                aria-checked={task.project_id === p.id}
                className={`tm-project ${task.project_id === p.id ? 'tm-current' : ''}`}
                style={{ '--project-color': projectIndex.colorOf(p.id) }}
                onClick={run(() => onMoveTo(task, p.id))}
              >
                <span className="tm-swatch" /> {p.name}
              </button>,
              ...projectIndex.categoriesOf(p.id).map((c) => (
                <button
                  key={c.id}
                  role="menuitemradio"
                  aria-checked={task.project_id === c.id}
                  className={`tm-category ${task.project_id === c.id ? 'tm-current' : ''}`}
                  onClick={run(() => onMoveTo(task, c.id))}
                >
                  {c.name}
                </button>
              )),
            ])}
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskMenu;
