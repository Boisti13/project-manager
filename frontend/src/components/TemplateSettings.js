import React, { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import TrashIcon from './TrashIcon';
import '../styles/Labels.css';
import { t, tn, shortDate } from '../i18n';
import { parseServerDate } from '../taskFilters';

// Settings → Task templates: what's there, who saved it, delete.
function TemplateSettings() {
  const { currentUser } = useAuth();
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/templates/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTemplates(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (tpl) => {
    if (!window.confirm(t('Delete the template “{name}”? Tasks created from it stay.', { name: tpl.name }))) return;
    const res = await authFetch(`/api/v1/templates/${tpl.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail || `HTTP ${res.status}`);
      return;
    }
    await load();
  };

  const canDelete = (tpl) => currentUser?.is_admin || tpl.created_by_id == null || tpl.created_by_id === currentUser?.id;

  return (
    <div className="settings-section">
      <h2>{t('Task templates')}</h2>
      <p className="settings-help">
        {t(
          'A task with its subtasks, saved to be created again: ⋯ → “Save as template…” on a task, then “From template” when adding a task. Templates are shared by everyone.'
        )}
      </p>
      {error && <p className="error-message">{error}</p>}
      {templates && templates.length === 0 && <p className="settings-help">{t('No templates yet.')}</p>}
      {templates && templates.length > 0 && (
        <ul className="label-list">
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <strong>{tpl.name}</strong>
              <span className="label-usage">
                {tn(tpl.task_count, 'one task', '{n} tasks')}
                {tpl.created_by && ` · ${t('by {name}', { name: tpl.created_by })}`}
                {tpl.created_at && ` · ${shortDate(parseServerDate(tpl.created_at))}`}
              </span>
              {canDelete(tpl) && (
                <span className="label-actions">
                  <button
                    className="task-action-btn delete-btn"
                    onClick={() => remove(tpl)}
                    title={t('Delete template')}
                    aria-label={t('Delete template')}
                  >
                    <TrashIcon />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TemplateSettings;
