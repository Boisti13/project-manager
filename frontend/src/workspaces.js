// Workspaces: each user's own groups of projects, e.g. "Work" and "Private"
// (backend routers/workspaces.py). The app shows one at a time, or all.
// No React in here; the state lives in context/WorkspaceContext.js.

/**
 * The scope for showing workspace `currentId` (null: all) from the server's
 * GET /workspaces/ answer -- or null when everything is shown (also when
 * that workspace no longer exists). includes(topProjectId) says whether a
 * top-level project (null: tasks without one) belongs: the workspace's own
 * projects, plus the ones in no workspace when unassigned_everywhere.
 */
export function workspaceScope(data, currentId) {
  const list = data?.workspaces || [];
  const workspace = currentId == null ? null : list.find((w) => w.id === currentId);
  if (!workspace) return null;
  const mine = new Set(workspace.project_ids);
  const filed = new Set(list.flatMap((w) => w.project_ids));
  const unassigned = data.unassigned_everywhere !== false;
  return {
    workspace,
    includes: (topId) => (topId != null && mine.has(topId)) || (unassigned && (topId == null || !filed.has(topId))),
  };
}

/** The workspace top-level project `projectId` is in, or null. */
export function workspaceOf(data, projectId) {
  return (data?.workspaces || []).find((w) => w.project_ids.includes(projectId)) || null;
}

/** The next one when switching through: All, then each workspace in order, then All again. */
export function nextWorkspaceId(list, currentId) {
  const ids = [null, ...list.map((w) => w.id)];
  const i = ids.indexOf(currentId);
  return ids[(i + 1) % ids.length];
}
