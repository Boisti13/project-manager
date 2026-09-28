import { authFetch } from '../../context/AuthContext';
import { t } from '../../i18n';
import { filtersToParams } from '../../taskFilters';
import { sameQuery } from '../../taskOps';
import { parseApiError, sendJson } from './taskApi';
import { useOptionalList } from './useTaskData';

/** Saved filters: the user's named sets of filters, search, sort and view. */
export function useSavedFilters({ filters, setSearchParams, setError, onApplied }) {
  const [savedFilters, reload] = useOptionalList('/api/v1/saved-filters/');
  const currentQuery = new URLSearchParams(filtersToParams(filters)).toString();
  const active = savedFilters.find((f) => sameQuery(f.query, currentQuery));

  const save = async () => {
    const name = window.prompt(t('Save these filters as:'), active?.name || '');
    if (!name || !name.trim()) return;
    try {
      await sendJson('/api/v1/saved-filters/', 'POST', { name: name.trim(), query: currentQuery });
      await reload();
    } catch (err) {
      setError(t('Failed to save the filter: {error}', { error: err.message }));
    }
  };

  const apply = (f) => {
    setSearchParams(new URLSearchParams(f.query), { replace: true });
    onApplied();
  };

  const remove = async (f) => {
    if (!window.confirm(t('Delete the saved filter “{name}”?', { name: f.name }))) return;
    try {
      const res = await authFetch(`/api/v1/saved-filters/${f.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await parseApiError(res));
      await reload();
    } catch (err) {
      setError(t('Failed to delete the filter: {error}', { error: err.message }));
    }
  };

  return { savedFilters, active, currentQuery, save, apply, remove };
}
