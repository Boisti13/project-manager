import React, { useEffect, useMemo, useRef, useState } from 'react';
import { spanOf, timelineRange, draggedDates, dependencyLinks, daysBetween, addDays } from '../timeline';
import { statusName } from '../names';
import '../styles/Timeline.css';
import { t, tn, locale } from '../i18n';

const ZOOMS = [
  { id: 'day', px: 34, label: () => t('Days') },
  { id: 'week', px: 16, label: () => t('Weeks') },
  { id: 'month', px: 5, label: () => t('Months') },
];
const ROW = 34; // px per row, kept in step with .tl-row in Timeline.css
const ZOOM_KEY = 'pm.timelineZoom';

const readZoom = () => {
  try {
    return ZOOMS.find((z) => z.id === localStorage.getItem(ZOOM_KEY))?.id || 'week';
  } catch {
    return 'week';
  }
};

const fmt = (day, opts) => day.toLocaleDateString(locale(), opts);

// Timeline (Gantt): each task with dates as a bar from its start to its
// deadline (◆ when there's only a deadline), grouped by project, with
// arrows for "waits for". Drag a bar to move it, its ends to change the
// start or the deadline; click it to open the task in the list.
function TaskTimeline({ tasks, projectIndex, onOpen, onChangeDates }) {
  const [zoom, setZoom] = useState(readZoom);
  const [drag, setDrag] = useState(null); // { id, edge, x0, delta, moved }
  const scrollRef = useRef(null);
  const px = ZOOMS.find((z) => z.id === zoom).px;
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const { rows, dated, range, undated } = useMemo(() => {
    const byId = new Map(tasks.map((x) => [x.id, x]));
    const withSpan = tasks.map((task) => ({ task, span: spanOf(task) })).filter((r) => r.span);
    const depth = (task) => {
      let n = 0;
      for (let p = byId.get(task.parent_task_id); p; p = byId.get(p.parent_task_id)) n += 1;
      return n;
    };
    const topOf = (task) => {
      for (let cur = task; cur; cur = byId.get(cur.parent_task_id)) {
        if (cur.project_id != null) return projectIndex.topOf(cur.project_id);
      }
      return null;
    };
    const groups = new Map();
    for (const r of withSpan) {
      const top = topOf(r.task);
      const key = top ? top.id : 'none';
      if (!groups.has(key)) groups.set(key, { project: top, items: [] });
      groups.get(key).items.push({ ...r, depth: depth(r.task), color: top ? projectIndex.colorOf(top.id) : '#9e9e9e' });
    }
    const order = [...projectIndex.allTopLevel.map((p) => p.id), 'none'];
    const list = [];
    for (const key of order) {
      const g = groups.get(key);
      if (!g) continue;
      list.push({ type: 'section', key: `s${key}`, project: g.project });
      g.items.forEach((item) => list.push({ type: 'task', key: item.task.id, ...item }));
    }
    return {
      rows: list,
      dated: withSpan,
      range: timelineRange(withSpan.map((r) => r.span), today),
      undated: tasks.filter((x) => !x.deadline && !x.start_date && x.status !== 'done').length,
    };
  }, [tasks, projectIndex, today]);

  const width = range.days * px;
  const x = (day) => daysBetween(range.start, day) * px;

  // Start with today in view (a few days in from the left).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, x(addDays(today, -3)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const setZoomSaved = (id) => {
    setZoom(id);
    try {
      localStorage.setItem(ZOOM_KEY, id);
    } catch {
      // per-browser convenience only
    }
  };

  // The scale: months on top, days (or Mondays) below.
  const scale = useMemo(() => {
    const months = [];
    const days = [];
    const weekends = [];
    for (let i = 0; i < range.days; i += 1) {
      const day = addDays(range.start, i);
      const last = months[months.length - 1];
      if (!last || last.m !== day.getMonth()) {
        months.push({ m: day.getMonth(), left: i * px, width: px, day });
      } else last.width += px;
      if (zoom !== 'month' && (day.getDay() === 0 || day.getDay() === 6)) weekends.push(i * px);
      if (zoom === 'day' || (zoom === 'week' && day.getDay() === 1)) days.push({ i, day });
    }
    return { months, days, weekends };
  }, [range, px, zoom]);

  // Row positions of tasks, for the dependency arrows.
  const rowOf = new Map();
  rows.forEach((r, i) => r.type === 'task' && rowOf.set(r.task.id, i));
  const spanNow = (task, span) => {
    if (!drag || drag.id !== task.id || !drag.delta) return span;
    const moved = draggedDates(task, drag.delta, drag.edge);
    return spanOf({ ...task, ...moved });
  };

  const startDrag = (e, task, edge) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: task.id, edge, x0: e.clientX, delta: 0, moved: false });
  };
  const moveDrag = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const delta = Math.round(dx / px);
    if (delta !== drag.delta || (!drag.moved && Math.abs(dx) > 3)) setDrag({ ...drag, delta, moved: drag.moved || Math.abs(dx) > 3 });
  };
  const endDrag = (task) => {
    if (!drag) return;
    const { delta, edge, moved } = drag;
    setDrag(null);
    if (delta) onChangeDates(task, draggedDates(task, delta, edge));
    else if (!moved && edge === 'move') onOpen(task);
  };

  const links = dependencyLinks(dated.map((r) => r.task));
  const center = (i) => i * ROW + ROW / 2;

  return (
    <div className="timeline" style={{ '--tl-px': `${px}px` }}>
      <div className="tl-toolbar">
        <div className="view-switch" role="group" aria-label={t('Zoom')}>
          {ZOOMS.map((z) => (
            <button key={z.id} className={zoom === z.id ? 'active' : ''} aria-pressed={zoom === z.id} onClick={() => setZoomSaved(z.id)}>
              {z.label()}
            </button>
          ))}
        </div>
        <button
          className="btn btn-secondary btn-small"
          onClick={() => scrollRef.current && (scrollRef.current.scrollLeft = Math.max(0, x(addDays(today, -3))))}
        >
          {t('Today')}
        </button>
        <span className="tl-hint">{t('Drag a bar to move it, its ends to change the start or the deadline.')}</span>
      </div>

      {rows.length === 0 ? (
        <p className="no-tasks">{t('No tasks with dates here. Give tasks a deadline (and a start) to see them on the timeline.')}</p>
      ) : (
        <div className="tl-scroll" ref={scrollRef}>
          <div className="tl-inner" style={{ width: `calc(var(--tl-title) + ${width}px)` }}>
            <div className="tl-head">
              <div className="tl-corner">{t('Task')}</div>
              <div className="tl-scale" style={{ width }}>
                {scale.months.map((m) => (
                  <div key={`${m.day.getFullYear()}-${m.m}`} className="tl-month" style={{ left: m.left, width: m.width }}>
                    {m.width > 40 && fmt(m.day, { month: m.width > 90 ? 'long' : 'short', year: m.width > 140 ? 'numeric' : undefined })}
                  </div>
                ))}
                {scale.days.map(({ i, day }) => (
                  <div
                    key={i}
                    className={`tl-day ${daysBetween(day, today) === 0 ? 'today' : ''}`}
                    style={{ left: i * px, width: zoom === 'day' ? px : px * 7 }}
                  >
                    {zoom === 'day' ? day.getDate() : fmt(day, { day: 'numeric', month: 'numeric' })}
                  </div>
                ))}
              </div>
            </div>

            <div className="tl-body" style={{ height: rows.length * ROW }}>
              <div className="tl-grid" style={{ width }}>
                {scale.weekends.map((left) => (
                  <div key={left} className="tl-weekend" style={{ left, width: px }} />
                ))}
                <div className="tl-today" style={{ left: x(today) + px / 2 }} title={t('Today')} />
                <svg className="tl-links" width={width} height={rows.length * ROW} aria-hidden="true">
                  <defs>
                    <marker id="tl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" />
                    </marker>
                  </defs>
                  {links.map(({ from, to }) => {
                    const a = rows[rowOf.get(from)];
                    const b = rows[rowOf.get(to)];
                    const sa = spanNow(a.task, a.span);
                    const sb = spanNow(b.task, b.span);
                    const x1 = x(sa.end) + px;
                    const y1 = center(rowOf.get(from));
                    const x2 = x(sb.start) + (sb.milestone ? px / 2 - 7 : 0);
                    const y2 = center(rowOf.get(to));
                    const bend = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 12));
                    return (
                      <path
                        key={`${from}-${to}`}
                        className={x2 < x1 ? 'late' : ''}
                        d={`M${x1},${y1} H${bend} V${y2} H${x2}`}
                        markerEnd="url(#tl-arrow)"
                      />
                    );
                  })}
                </svg>
              </div>

              {rows.map((r) =>
                r.type === 'section' ? (
                  <div key={r.key} className="tl-row tl-section" style={{ '--project-color': r.project ? projectIndex.colorOf(r.project.id) : '#9e9e9e' }}>
                    <div className="tl-label">
                      <span className="project-swatch" />
                      {r.project ? r.project.name : t('No project')}
                    </div>
                  </div>
                ) : (
                  <TimelineRow
                    key={r.key}
                    row={r}
                    span={spanNow(r.task, r.span)}
                    x={x}
                    px={px}
                    today={today}
                    color={r.color}
                    dragging={drag?.id === r.task.id}
                    onOpen={onOpen}
                    startDrag={startDrag}
                    moveDrag={moveDrag}
                    endDrag={endDrag}
                  />
                )
              )}
            </div>
          </div>
        </div>
      )}

      {undated > 0 && (
        <p className="archive-note">
          {tn(undated, 'One open task has no dates and isn’t shown.', '{n} open tasks have no dates and aren’t shown.')}
        </p>
      )}
    </div>
  );
}

function TimelineRow({ row, span, x, px, today, color, dragging, onOpen, startDrag, moveDrag, endDrag }) {
  const { task, depth } = row;
  const done = task.status === 'done';
  const late = !done && span.end < today;
  const left = x(span.start);
  const width = (daysBetween(span.start, span.end) + 1) * px;
  const dates = span.milestone
    ? fmt(span.end, { weekday: 'short', day: 'numeric', month: 'short' })
    : `${fmt(span.start, { day: 'numeric', month: 'short' })} – ${fmt(span.end, { day: 'numeric', month: 'short' })}`;
  const tip = `${task.title}\n${dates} · ${statusName(task.status)}${span.open ? ` · ${t('no deadline')}` : ''}`;
  // Each part handles its own drag; stopPropagation keeps an edge's events
  // from also reaching the bar (which would apply the same drag twice).
  const handlers = (edge) => ({
    onPointerDown: (e) => startDrag(e, task, edge),
    onPointerMove: (e) => {
      e.stopPropagation();
      moveDrag(e);
    },
    onPointerUp: (e) => {
      e.stopPropagation();
      endDrag(task);
    },
    onPointerCancel: (e) => {
      e.stopPropagation();
      endDrag(task);
    },
  });

  return (
    <div className="tl-row" id={`tl-${task.id}`}>
      <div className="tl-label" style={{ paddingLeft: 10 + depth * 14 }}>
        <button className={`tl-title ${done ? 'task-title-done' : ''}`} onClick={() => onOpen(task)} title={t('Show in the list')}>
          {task.title}
        </button>
      </div>
      <div className="tl-track">
        {span.milestone ? (
          <div
            className={`tl-milestone ${done ? 'done' : ''} ${late ? 'late' : ''} ${dragging ? 'dragging' : ''}`}
            style={{ left: left + px / 2, '--bar-color': color }}
            title={tip}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onOpen(task)}
            {...handlers('move')}
          />
        ) : (
          <div
            className={`tl-bar ${done ? 'done' : ''} ${late ? 'late' : ''} ${span.open ? 'open' : ''} ${dragging ? 'dragging' : ''}`}
            style={{ left, width, '--bar-color': color }}
            title={tip}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onOpen(task)}
            {...handlers('move')}
          >
            {!span.open && <span className="tl-handle start" {...handlers('start')} />}
            {width > 70 && <span className="tl-bar-text">{task.title}</span>}
            {!span.open && <span className="tl-handle end" {...handlers('end')} />}
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskTimeline;
