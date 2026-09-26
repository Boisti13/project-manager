import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import { buildProjectIndex } from '../projects';
import { tasksToCsv } from '../exportCsv';
import { t, tn, locale } from '../i18n';

const formatSize = (bytes) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const errorText = async (res) => {
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.detail) ? data.detail[0].msg : data.detail || `HTTP ${res.status}`;
};

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Settings → Backup & export. CSV export for everyone; database backups
// (list, download, back up now, how many to keep) for admins.
function BackupSettings() {
  const { currentUser } = useAuth();
  const isAdmin = !!currentUser?.is_admin;

  const [keep, setKeep] = useState('');
  const [savedKeep, setSavedKeep] = useState(null);
  const [daily, setDaily] = useState(null);
  const [backups, setBackups] = useState(null);
  const [backupDir, setBackupDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { ok, text }
  const uploadRef = useRef(null);

  const loadBackups = useCallback(async () => {
    const res = await authFetch('/api/system/backups');
    if (!res.ok) throw new Error(await errorText(res));
    const data = await res.json();
    setBackups(data.backups);
    setBackupDir(data.dir);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    authFetch('/api/settings/')
      .then((r) => r.json())
      .then((d) => {
        setKeep(String(d.backup_keep));
        setSavedKeep(d.backup_keep);
        setDaily(d.backup_daily);
      })
      .catch(() => {});
    loadBackups().catch((err) => setStatus({ ok: false, text: t('Could not list backups: {error}', { error: err.message }) }));
  }, [isAdmin, loadBackups]);

  const run = async (fn) => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const saveKeep = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await authFetch('/api/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup_keep: parseInt(keep, 10) }),
      });
      if (!res.ok) throw new Error(t('Could not save: {error}', { error: await errorText(res) }));
      const d = await res.json();
      setSavedKeep(d.backup_keep);
      setKeep(String(d.backup_keep));
      setStatus({ ok: true, text: t('Saved. Applies from the next backup.') });
    });
  };

  const saveDaily = (on) =>
    run(async () => {
      const res = await authFetch('/api/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup_daily: on }),
      });
      if (!res.ok) throw new Error(t('Could not save: {error}', { error: await errorText(res) }));
      const d = await res.json();
      setDaily(d.backup_daily);
      setStatus({ ok: true, text: d.backup_daily ? t('Nightly backups are on.') : t('Nightly backups are off.') });
    });

  const backupNow = () =>
    run(async () => {
      const res = await authFetch('/api/system/backups', { method: 'POST' });
      if (!res.ok) throw new Error(await errorText(res));
      await loadBackups();
      setStatus({ ok: true, text: t('Backup created.') });
    });

  const download = (name) =>
    run(async () => {
      const res = await authFetch(`/api/system/backups/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(t('Download failed: {error}', { error: await errorText(res) }));
      saveBlob(await res.blob(), name);
    });

  const upload = (file) =>
    run(async () => {
      const form = new FormData();
      form.append('file', file);
      const res = await authFetch('/api/system/backups/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error(t('Upload failed: {error}', { error: await errorText(res) }));
      const d = await res.json();
      await loadBackups();
      setStatus({ ok: true, text: t('Uploaded as {name}. Use “Restore” on it to load it.', { name: d.name }) });
    });

  const restore = (b) => {
    const when = new Date(b.created * 1000).toLocaleString(locale());
    const ok = window.confirm(
      t(
        'Restore “{name}” ({when})?\n\nThis REPLACES ALL DATA — users, projects, tasks and settings — with the contents of that backup. A safety backup of the current data is made first.\n\nAfterwards you may have to log in again with an account from the backup.',
        { name: b.name, when }
      )
    );
    if (!ok) return;
    run(async () => {
      setStatus({ ok: true, text: t('Restoring… this can take a moment.') });
      const res = await authFetch(`/api/system/backups/${encodeURIComponent(b.name)}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error(await errorText(res));
      setStatus({ ok: true, text: t('Restore complete. Reloading…') });
      setTimeout(() => window.location.assign('/'), 1500);
    });
  };

  const remove = (b) => {
    const when = new Date(b.created * 1000).toLocaleString(locale());
    if (!window.confirm(t("Delete backup “{name}” ({when})? This can't be undone.", { name: b.name, when }))) return;
    run(async () => {
      const res = await authFetch(`/api/system/backups/${encodeURIComponent(b.name)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('Delete failed: {error}', { error: await errorText(res) }));
      await loadBackups();
      setStatus({ ok: true, text: t('Deleted {name}.', { name: b.name }) });
    });
  };

  const exportCsv = () =>
    run(async () => {
      const get = async (url) => {
        const r = await authFetch(url);
        if (!r.ok) throw new Error(t('Export failed: {error}', { error: await errorText(r) }));
        return r.json();
      };
      const [tasks, projects, users, labels] = await Promise.all([
        get('/api/tasks/'),
        get('/api/projects/'),
        get('/api/users/'),
        get('/api/labels/'),
      ]);
      const csv = tasksToCsv(tasks, buildProjectIndex(projects), users, labels);
      const day = new Date().toISOString().slice(0, 10);
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `project-manager-tasks-${day}.csv`);
      setStatus({ ok: true, text: tn(tasks.length, 'Exported one task.', 'Exported {n} tasks.') });
    });

  // The number box sits inside the sentence; languages put it in different places.
  const [keepBefore, keepAfter] = t('Keep the newest {n} backups of each kind (nightly / other)').split('{n}');

  return (
    <div className="settings-section">
      <h2>{t('Backup & export')}</h2>

      <div className="backup-row">
        <div>
          <strong>{t('Export tasks')}</strong>
          <p className="settings-help">
            {t('All tasks, including subtasks, done and archived ones, as a CSV file for Excel (semicolon-separated).')}
          </p>
        </div>
        <button className="btn btn-secondary btn-small" onClick={exportCsv} disabled={busy}>
          {t('Export CSV')}
        </button>
      </div>

      {isAdmin && (
        <>
          <div className="backup-row">
            <div>
              <strong>{t('Database backups')}</strong>
              <p className="settings-help">
                {t('Full database dumps in {dir}.', { dir: backupDir || '…' })}{' '}
                {t(
                  'One is made automatically every night (if turned on below) and before every update, re-install and restore. “Restore” replaces all data with a backup; to move to a new server, download a backup here and upload it there.'
                )}
              </p>
            </div>
            <div className="backup-actions">
              <button className="btn btn-primary btn-small" onClick={backupNow} disabled={busy}>
                {busy ? t('Working…') : t('Back up now')}
              </button>
              <button className="btn btn-secondary btn-small" onClick={() => uploadRef.current?.click()} disabled={busy}>
                {t('Upload backup…')}
              </button>
              <input
                ref={uploadRef}
                type="file"
                accept=".dump"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) upload(f);
                }}
              />
            </div>
          </div>

          <label className="backup-daily">
            <input
              type="checkbox"
              checked={!!daily}
              disabled={daily === null || busy}
              onChange={(e) => saveDaily(e.target.checked)}
            />
            {t('Back up automatically every night (03:15)')}
          </label>

          <form className="archive-form" onSubmit={saveKeep}>
            <label htmlFor="backup-keep">{keepBefore}</label>
            <input
              id="backup-keep"
              type="number"
              min="1"
              max="100"
              inputMode="numeric"
              value={keep}
              onChange={(e) => setKeep(e.target.value)}
              disabled={savedKeep === null}
              required
            />
            <span>{keepAfter}</span>
            <button type="submit" className="btn btn-primary btn-small" disabled={busy || String(savedKeep) === keep}>
              {t('Save')}
            </button>
          </form>

          {backups && backups.length === 0 && <p className="settings-help backup-empty">{t('No backups yet.')}</p>}
          {backups && backups.length > 0 && (
            <ul className="backup-list">
              {backups.map((b) => (
                <li key={b.name}>
                  <span className="backup-name">{b.name}</span>
                  <span className="backup-meta">
                    {new Date(b.created * 1000).toLocaleString(locale())} · {formatSize(b.size)}
                  </span>
                  <span className="backup-buttons">
                    <button className="btn btn-secondary btn-small" onClick={() => download(b.name)} disabled={busy}>
                      {t('Download')}
                    </button>
                    <button className="btn btn-secondary btn-small btn-danger" onClick={() => restore(b)} disabled={busy}>
                      {t('Restore')}
                    </button>
                    <button
                      className="btn btn-secondary btn-small btn-danger"
                      onClick={() => remove(b)}
                      disabled={busy}
                      title={t('Delete this backup')}
                    >
                      {t('Delete')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {status && <p className={status.ok ? 'settings-ok' : 'error-message'}>{status.text}</p>}
    </div>
  );
}

export default BackupSettings;
