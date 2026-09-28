import { useCallback, useEffect, useState } from 'react';
import { useSyncRefresh } from '../../desktop/useSyncRefresh';
import { t } from '../../i18n';
import { fetchJson } from './taskApi';

/**
 * Everything the Tasks page shows, loaded together. pendingDelete: the ref
 * of useUndoableDelete; tasks waiting out their Undo time stay hidden.
 */
export function useTaskData(pendingDelete) {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [archiveAfterDays, setArchiveAfterDays] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // quiet: refresh in the background (Windows app sync, Undo) without the loading screen
  const loadData = useCallback(
    async (quiet = false) => {
      try {
        if (!quiet) setLoading(true);
        const [tasksRes, projectsRes, usersRes, settingsRes, labelsRes] = await Promise.all([
          fetchJson('/api/tasks/'),
          fetchJson('/api/projects/'),
          fetchJson('/api/users/'),
          fetchJson('/api/settings/'),
          fetchJson('/api/labels/'),
        ]);
        setLabels(labelsRes);
        const pending = pendingDelete.current;
        setTasks(pending ? tasksRes.filter((x) => !pending.ids.has(x.id)) : tasksRes);
        setProjects(projectsRes);
        setUsers(usersRes);
        setArchiveAfterDays(settingsRes.archive_after_days);
        setError(null);
      } catch (err) {
        setError(t('Failed to load data: {error}', { error: err.message }));
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [pendingDelete]
  );

  // Load once when the page opens.
  useEffect(() => {
    loadData();
  }, [loadData]);
  // Windows app: show what a background sync brought in.
  useSyncRefresh(() => loadData(true));

  return { tasks, setTasks, projects, users, labels, setLabels, archiveAfterDays, loading, error, setError, loadData };
}

/**
 * A list that's nice to have but not essential (saved filters, templates):
 * when loading fails (e.g. the Windows app offline) it just stays empty.
 */
export function useOptionalList(url) {
  const [items, setItems] = useState([]);
  const reload = useCallback(async () => {
    try {
      setItems(await fetchJson(url));
    } catch {
      // not offered
    }
  }, [url]);
  useEffect(() => {
    reload();
  }, [reload]);
  return [items, reload];
}
