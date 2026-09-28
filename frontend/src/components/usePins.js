import { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';

// The last known pins per user, for a quick start and for the Windows app offline.
const cacheKey = (userId) => `pm.pins.${userId ?? ''}`;
const readCache = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
};
const writeCache = (key, ids) => {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // per-browser convenience only
  }
};

/**
 * The current user's pinned tasks (GET/PUT/DELETE /api/v1/pins/), oldest
 * first. toggle / unpin change the list right away and put it back when the
 * server says no (onError gets the reason).
 */
export function usePins(onError) {
  const { currentUser } = useAuth();
  const key = cacheKey(currentUser?.id);
  const [ids, setIds] = useState(() => readCache(key));

  const save = (next) => {
    setIds(next);
    writeCache(key, next);
  };

  const reload = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/pins/');
      if (res.ok) {
        const list = await res.json();
        setIds(list);
        writeCache(key, list);
      }
    } catch {
      // keep the cached list
    }
  }, [key]);

  useEffect(() => {
    reload();
  }, [reload]);

  const send = async (taskId, method) => {
    const res = await authFetch(`/api/v1/pins/${taskId}`, { method });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
  };

  const toggle = async (taskId) => {
    const before = ids;
    const pinned = ids.includes(taskId);
    save(pinned ? ids.filter((x) => x !== taskId) : [...ids, taskId]);
    try {
      await send(taskId, pinned ? 'DELETE' : 'PUT');
    } catch (err) {
      save(before);
      onError?.(err.message);
    }
  };

  const unpin = async (taskIds) => {
    const before = ids;
    save(ids.filter((x) => !taskIds.includes(x)));
    try {
      for (const id of taskIds) await send(id, 'DELETE');
    } catch (err) {
      save(before);
      onError?.(err.message);
    }
  };

  return { ids, has: (id) => ids.includes(id), toggle, unpin, reload };
}
