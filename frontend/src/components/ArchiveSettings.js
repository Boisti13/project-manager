import React, { useState, useEffect } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import { t } from '../i18n';

// Settings → Completed tasks: how long done tasks stay in the "Completed"
// rows before they're archived. Everyone sees it, admins can change it.
function ArchiveSettings() {
  const { currentUser } = useAuth();
  const isAdmin = !!currentUser?.is_admin;
  const [saved, setSaved] = useState(null);
  const [days, setDays] = useState('');
  const [status, setStatus] = useState(null); // { ok, text }

  useEffect(() => {
    authFetch('/api/settings/')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setSaved(d.archive_after_days);
        setDays(String(d.archive_after_days));
      })
      .catch((err) => setStatus({ ok: false, text: t('Could not load settings: {error}', { error: err.message }) }));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setStatus(null);
    try {
      const res = await authFetch('/api/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive_after_days: parseInt(days, 10) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(Array.isArray(data.detail) ? data.detail[0].msg : data.detail || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setSaved(d.archive_after_days);
      setDays(String(d.archive_after_days));
      setStatus({ ok: true, text: t('Saved.') });
    } catch (err) {
      setStatus({ ok: false, text: t('Could not save: {error}', { error: err.message }) });
    }
  };

  // The number box sits inside the sentence; languages put it in different places.
  const [archiveBefore, archiveAfter] = t('Archive completed tasks after {days} days').split('{days}');

  return (
    <div className="settings-section">
      <h2>{t('Completed tasks')}</h2>
      <p className="settings-help">
        {t(
          "Ticked-off tasks move into a collapsed “Completed” row in their project. After the number of days below they're archived: hidden from the Tasks page, but still found by search or the “Done” status filter. Nothing is deleted."
        )}
      </p>
      <form className="archive-form" onSubmit={save}>
        <label htmlFor="archive-days">{archiveBefore}</label>
        <input
          id="archive-days"
          type="number"
          min="1"
          max="3650"
          inputMode="numeric"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          disabled={!isAdmin || saved === null}
          required
        />
        <span>{archiveAfter}</span>
        {isAdmin && (
          <button type="submit" className="btn btn-primary btn-small" disabled={String(saved) === days}>
            {t('Save')}
          </button>
        )}
      </form>
      {!isAdmin && <p className="settings-help">{t('Only admins can change this.')}</p>}
      {status && <p className={status.ok ? 'settings-ok' : 'error-message'}>{status.text}</p>}
    </div>
  );
}

export default ArchiveSettings;
