import { useEffect, useRef, useState } from 'react';
import { isListView } from '../../views';

/** Ids of the task rows on screen, top to bottom (subtasks after their parent). */
export const shownTaskIds = () =>
  [...document.querySelectorAll('.task-list .task-item')].map((r) => parseInt(r.id.slice(5), 10));

/**
 * Select mode: tasks picked to change together. Only the list view has it;
 * picks that leave the view (filtered out, collapsed, done) are dropped.
 */
export function useSelection({ view, tasks, filters }) {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState(new Set());
  const anchor = useRef(null);

  const toggle = (id, range = false) => {
    // Read now: the updater below runs later, after the anchor has moved on.
    const order = shownTaskIds();
    const a = order.indexOf(anchor.current);
    const b = order.indexOf(id);
    setIds((prev) => {
      const next = new Set(prev);
      if (range && a !== -1 && b !== -1) {
        order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => next.add(x));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchor.current = id;
  };

  const exit = () => {
    setActive(false);
    setIds(new Set());
    anchor.current = null;
  };

  useEffect(() => {
    if (!isListView(view)) exit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (!active) return;
    setIds((prev) => {
      const next = new Set([...prev].filter((id) => document.getElementById(`task-${id}`)));
      return next.size === prev.size ? prev : next;
    });
  }, [tasks, filters, active]);

  return {
    active,
    start: () => setActive(true),
    exit,
    ids,
    setIds,
    toggle,
    selectAll: () => setIds(new Set(shownTaskIds())),
    clear: () => setIds(new Set()),
  };
}
