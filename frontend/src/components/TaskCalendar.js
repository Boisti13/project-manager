import React, { useMemo, useState } from 'react';
import { dayKey, deadlineKey, monthGrid, tasksByDay } from '../views';
import { formatDay, isOverdue } from './TaskBoard';
import '../styles/TaskViews.css';
import { t, tn, locale } from '../i18n';

// Short weekday names, Monday first (1 Jan 2024 was a Monday).
const weekdays = () =>
  [0, 1, 2, 3, 4, 5, 6].map((i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }));
const SHOWN_PER_DAY = 3;

// Month view of deadlines (subtasks included). Click a day to list its
// tasks below the grid; drag a task onto another day to move its deadline.
function TaskCalendar({ tasks, projectIndex, onOpen, onReschedule }) {
  const today = dayKey(new Date());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [overDay, setOverDay] = useState(null);

  const byDay = useMemo(() => tasksByDay(tasks), [tasks]);
  const weeks = useMemo(() => monthGrid(month.y, month.m), [month]);
  const undated = tasks.filter((t) => !t.deadline && t.status !== 'done').length;

  const shift = (n) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const goToday = () => {
    const d = new Date();
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(today);
  };

  const title = new Date(month.y, month.m, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  const selectedTasks = byDay.get(selected) || [];
  const selectedLabel = new Date(`${selected}T00:00:00`).toLocaleDateString(locale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // A span, not a button: Firefox can't drag buttons.
  const chip = (task) => (
    <span
      key={task.id}
      role="button"
      tabIndex={0}
      className={`cal-chip ${task.status === 'done' ? 'done' : ''} ${isOverdue(task) ? 'overdue' : ''}`}
      style={{ '--project-color': projectIndex.colorOf(task.project_id) }}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(task.id));
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          onOpen(task);
        }
      }}
      title={`${task.title}${task.project_id != null ? ` — ${projectIndex.labelOf(task.project_id)}` : ''}`}
    >
      {task.title}
    </span>
  );

  return (
    <div className="calendar">
      <div className="cal-toolbar">
        <button className="btn btn-secondary btn-small" onClick={() => shift(-1)} aria-label={t('Previous month')}>
          ◀
        </button>
        <h2 className="cal-title">{title}</h2>
        <button className="btn btn-secondary btn-small" onClick={() => shift(1)} aria-label={t('Next month')}>
          ▶
        </button>
        <button className="btn btn-secondary btn-small" onClick={goToday}>
          {t('Today')}
        </button>
      </div>

      <div className="cal-grid" role="grid" aria-label={title}>
        {weekdays().map((d) => (
          <div key={d} className="cal-weekday" role="columnheader">
            {d}
          </div>
        ))}
        {weeks.flat().map((date) => {
          const key = dayKey(date);
          const list = byDay.get(key) || [];
          const open = list.filter((t) => t.status !== 'done');
          const late = open.some(isOverdue);
          return (
            <div
              key={key}
              role="gridcell"
              tabIndex={0}
              aria-selected={key === selected}
              aria-label={`${date.toLocaleDateString(locale())}: ${tn(list.length, 'one task', '{n} tasks')}`}
              className={[
                'cal-day',
                date.getMonth() !== month.m ? 'other-month' : '',
                key === today ? 'today' : '',
                key === selected ? 'selected' : '',
                overDay === key ? 'drop-target' : '',
              ].join(' ')}
              onClick={() => setSelected(key)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(key)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overDay !== key) setOverDay(key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOverDay(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOverDay(null);
                const t = tasks.find((x) => x.id === parseInt(e.dataTransfer.getData('text/plain'), 10));
                if (t && deadlineKey(t) !== key) onReschedule(t, key);
              }}
            >
              <span className="cal-date">{date.getDate()}</span>
              <div className="cal-chips">
                {list.slice(0, SHOWN_PER_DAY).map(chip)}
                {list.length > SHOWN_PER_DAY && (
                  <span className="cal-more">{t('+{n} more', { n: list.length - SHOWN_PER_DAY })}</span>
                )}
              </div>
              {/* Phones: dots instead of titles. */}
              {list.length > 0 && (
                <span className={`cal-dots ${late ? 'overdue' : ''}`} aria-hidden="true">
                  {list.slice(0, 4).map((t) => (
                    <span
                      key={t.id}
                      className={t.status === 'done' ? 'done' : ''}
                      style={{ '--project-color': projectIndex.colorOf(t.project_id) }}
                    />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <section className="cal-agenda" aria-live="polite">
        <h3>
          {selectedLabel}
          {selected === today && <span className="cal-today-tag">{t('Today')}</span>}
        </h3>
        {selectedTasks.length === 0 ? (
          <p className="comments-empty">{t('Nothing due.')}</p>
        ) : (
          <ul>
            {selectedTasks.map((task) => (
              <li key={task.id} style={{ '--project-color': projectIndex.colorOf(task.project_id) }}>
                <span className="project-swatch" />
                <button
                  className={`link-btn cal-agenda-title ${task.status === 'done' ? 'done' : ''}`}
                  onClick={() => onOpen(task)}
                >
                  {task.title}
                </button>
                {task.project_id != null && <span className="cal-agenda-project">{projectIndex.labelOf(task.project_id)}</span>}
                {isOverdue(task) && (
                  <span className="task-deadline overdue">{t('overdue since {date}', { date: formatDay(task.deadline) })}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {undated > 0 && (
          <p className="settings-help cal-undated">
            {tn(
              undated,
              "One open task has no deadline and isn't shown in the calendar.",
              "{n} open tasks have no deadline and aren't shown in the calendar."
            )}
          </p>
        )}
      </section>
    </div>
  );
}

export default TaskCalendar;
