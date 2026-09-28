import { useEffect, useRef } from 'react';
import { shownTaskIds } from './useSelection';

/**
 * Keyboard shortcuts of the Tasks page (listed in KeyboardHelp.js). Keys are
 * ignored while typing in a field or with Ctrl/Alt/Cmd. `ctx` is read fresh
 * on every key press:
 *   enabled, listView, keyboardId, setKeyboardId, showKeys, setShowKeys,
 *   selection (useSelection), deleteSelected, tasks,
 *   focusSearch, newTask, edit(task), addSubtask(task), toggleDone(task), deleteTask(id), togglePin(task)
 */
export function useTaskShortcuts(ctx) {
  const latest = useRef(ctx);
  latest.current = ctx;

  useEffect(() => {
    const onKey = (e) => handleKey(e, latest.current);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function handleKey(e, c) {
  if (e.ctrlKey || e.metaKey || e.altKey || !c.enabled) return;
  const el = document.activeElement;
  const tag = el?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
  if (e.key === '?') {
    c.setShowKeys((v) => !v);
    return;
  }
  if (e.key === 'Escape') {
    if (c.showKeys) c.setShowKeys(false);
    else if (c.selection.active) c.selection.exit();
    else c.setKeyboardId(null);
    return;
  }
  if (c.showKeys) return;
  if (e.key === '/') {
    e.preventDefault();
    c.focusSearch();
    return;
  }
  if (e.key === 'n') {
    e.preventDefault();
    c.newTask();
    return;
  }
  if (!c.listView) return;

  const ids = shownTaskIds();
  if (e.key === 'j' || e.key === 'k') {
    if (!ids.length) return;
    e.preventDefault();
    const i = ids.indexOf(c.keyboardId);
    const step = e.key === 'j' ? 1 : -1;
    const next = i === -1 ? (step > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, i + step));
    c.setKeyboardId(ids[next]);
    document.getElementById(`task-${ids[next]}`)?.querySelector('.task-header')?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key === 'Delete' && c.selection.active && c.selection.ids.size) {
    c.deleteSelected();
    return;
  }
  const task = ids.includes(c.keyboardId) ? c.tasks.find((x) => x.id === c.keyboardId) : null;
  if (!task) return;
  const click = (selector) =>
    document.getElementById(`task-${task.id}`)?.querySelector(`:scope > .task-header ${selector}`)?.click();
  if (e.key === 'e') {
    e.preventDefault();
    c.edit(task);
  } else if (e.key === 'a') {
    e.preventDefault();
    c.addSubtask(task);
  } else if (e.key === 'x') {
    c.toggleDone(task);
  } else if (e.key === 'p') {
    c.togglePin(task);
  } else if (e.key === 'c') {
    click('.comment-btn');
  } else if (e.key === 'o') {
    click('.expand-btn');
  } else if (e.key === ' ') {
    e.preventDefault();
    c.selection.start();
    c.selection.toggle(task.id, e.shiftKey);
  } else if (e.key === 'Delete') {
    c.deleteTask(task.id);
  }
}
