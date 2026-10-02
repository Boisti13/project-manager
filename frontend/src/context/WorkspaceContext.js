import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authFetch, useAuth } from './AuthContext';
import { workspaceOf, workspaceScope } from '../workspaces';

// The user's workspaces (GET /api/v1/workspaces/) and which one is shown.
// The list is cached per user for a quick start and for the Windows/Linux
// app offline; the shown workspace is remembered per device.
const EMPTY = { workspaces: [], unassigned_everywhere: true };
const dataKey = (userId) => `pm.workspaces.${userId ?? ''}`;
const currentKey = (userId) => `pm.workspace.${userId ?? ''}`;

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // per-browser convenience only
  }
};

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const [data, setData] = useState(() => read(dataKey(userId), EMPTY));
  const [currentId, setCurrentId] = useState(() => read(currentKey(userId), null));

  const reload = useCallback(async () => {
    if (userId == null) return;
    try {
      const res = await authFetch('/api/v1/workspaces/');
      if (!res.ok) return;
      const next = await res.json();
      setData(next);
      write(dataKey(userId), next);
    } catch {
      // offline: keep the cached list
    }
  }, [userId]);

  // Another user (or none): their own list and choice.
  useEffect(() => {
    setData(read(dataKey(userId), EMPTY));
    setCurrentId(read(currentKey(userId), null));
    reload();
  }, [userId, reload]);

  const exists = data.workspaces.some((w) => w.id === currentId);
  const setCurrent = useCallback(
    (id) => {
      setCurrentId(id);
      write(currentKey(userId), id);
    },
    [userId]
  );

  /** Puts top-level project `projectId` into workspace `workspaceId` (null: none), then reloads. */
  const assignProject = useCallback(
    async (projectId, workspaceId) => {
      const res = await authFetch(`/api/v1/workspaces/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`);
      }
      await reload();
    },
    [reload]
  );

  const value = useMemo(
    () => ({
      workspaces: data.workspaces,
      unassignedEverywhere: data.unassigned_everywhere !== false,
      // The workspace shown, or null for all of them (also when it was deleted).
      current: exists ? data.workspaces.find((w) => w.id === currentId) : null,
      setCurrent,
      scope: workspaceScope(data, exists ? currentId : null),
      workspaceOf: (projectId) => workspaceOf(data, projectId),
      assignProject,
      reload,
    }),
    [data, currentId, exists, setCurrent, assignProject, reload]
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

// Outside a provider (tests, the share page): no workspaces, everything shown.
const NONE = {
  workspaces: [],
  unassignedEverywhere: true,
  current: null,
  setCurrent: () => {},
  scope: null,
  workspaceOf: () => null,
  assignProject: async () => {},
  reload: async () => {},
};

export function useWorkspace() {
  return useContext(WorkspaceContext) || NONE;
}
