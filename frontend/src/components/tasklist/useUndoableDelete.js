import { useEffect, useRef } from 'react';
import { authFetch } from '../../context/AuthContext';
import { t, tn } from '../../i18n';
import { topmost, withDescendants } from '../../taskOps';
import { UNDO_MS } from '../UndoToast';
import { parseApiError } from './taskApi';

/**
 * Deleting with Undo: tasks leave the list at once and are only really
 * deleted when the Undo time is up — or right away when the page is left.
 * pendingDelete: a ref shared with useTaskData ({ taskIds, ids, timer }).
 * Returns deleteTasks(tasks, pickedIds, onRestored?).
 */
export function useUndoableDelete({ pendingDelete, setTasks, reload, setError, setUndo }) {
  const send = async (p) => {
    try {
      for (const id of p.taskIds) {
        const response = await authFetch(`/api/tasks/${id}`, { method: 'DELETE', keepalive: true });
        if (!response.ok && response.status !== 404) throw new Error(await parseApiError(response));
      }
    } catch (err) {
      setError(t('Failed to delete task: {error}', { error: err.message }));
      reload(true);
    }
  };

  const flush = () => {
    const p = pendingDelete.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingDelete.current = null;
    send(p);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const onLeave = () => flushRef.current();
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      onLeave();
    };
  }, []);

  return (tasks, pickedIds, onRestored = null) => {
    const top = topmost(tasks, pickedIds);
    if (top.length === 0) return;
    flush();
    // Only the top ones are sent; their subtasks go with them.
    const ids = withDescendants(tasks, top.map((x) => x.id));
    setTasks((ts) => ts.filter((x) => !ids.has(x.id)));
    const p = { taskIds: top.map((x) => x.id), ids };
    p.timer = setTimeout(() => {
      if (pendingDelete.current === p) {
        pendingDelete.current = null;
        send(p);
      }
    }, UNDO_MS + 300);
    pendingDelete.current = p;
    const subtasks = ids.size - top.length;
    setUndo({
      key: Date.now(),
      message:
        (top.length === 1
          ? t('Deleted “{title}”', { title: top[0].title })
          : tn(top.length, 'Deleted one task', 'Deleted {n} tasks')) +
        (subtasks ? ' ' + tn(subtasks, '(and one subtask)', '(and {n} subtasks)') : ''),
      onUndo: () => {
        if (pendingDelete.current === p) {
          clearTimeout(p.timer);
          pendingDelete.current = null;
        }
        reload(true).then(() => onRestored?.());
      },
    });
  };
}
