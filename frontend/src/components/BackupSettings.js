import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import { buildProjectIndex } from '../projects';
import { tasksToCsv } from '../exportCsv';

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
    loadBackups().catch((err) => setStatus({ ok: false, text: 'Could not list backups: ' + err.message }));
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
      if (!res.ok) throw new Error('Could not save: ' + (await errorText(res)));
      const d = await res.json();
      setSavedKeep(d.backup_keep);
      setKeep(String(d.backup_keep));
      setStatus({ ok: true, text: 'Saved. Applies from the next backup.' });
    });
  };

  const saveDaily = (on) =>
    run(async () => {
      const res = await authFetch('/api/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup_daily: on }),
      });
      if (!res.ok) throw new Error('Could not save: ' + (await errorText(res)));
      const d = await res.json();
      setDaily(d.backup_daily);
      setStatus({ ok: true, text: d.backup_daily ? 'Nightly backups are on.' : 'Nightly backups are off.' });
    });

  const backupNow = () =>
    run(async () => {
      const res = await authFetch('/api/system/backups', { method: 'POST' });
      if (!res.ok) throw new Error(await errorText(res));
      await loadBackups();
      setStatus({ ok: true, text: 'Backup created.' });
    });

  const download = (name) =>
    run(async () => {
      const res = await authFetch(`/api/system/backups/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error('Download failed: ' + (await errorText(res)));
      saveBlob(await res.blob(), name);
    });

  const upload = (file) =>
    run(async () => {
      const form = new FormData();
      form.append('file', file);
      const res = await authFetch('/api/system/backups/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed: ' + (await errorText(res)));
      const d = await res.json();
      await loadBackups();
      setStatus({ ok: true, text: `Uploaded as ${d.name}. Use "Restore" on it to load it.` });
    });

  const restore = (b) => {
    const when = new Date(b.created * 1000).toLocaleString();
    const ok = window.confirm(
      `Restore "${b.name}" (${when})?\n\n` +
        'This REPLACES ALL DATA — users, projects, tasks and settings — with the contents of that backup. ' +
        'A safety backup of the current data is made first.\n\n' +
        'Afterwards you may have to log in again with an account from the backup.'
    );
    if (!ok) return;
    run(async () => {
      setStatus({ ok: true, text: 'Restoring… this can take a moment.' });
      const res = await authFetch(`/api/system/backups/${encodeURIComponent(b.name)}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error(await errorText(res));
      setStatus({ ok: true, text: 'Restore complete. Reloading…' });
      setTimeout(() => window.location.assign('/'), 1500);
    });
  };

  const remove = (b) => {
    const when = new Date(b.created * 1000).toLocaleString();
    if (!window.confirm(`Delete backup "${b.name}" (${when})? This can't be undone.`)) return;
    run(async () => {
      const res = await authFetch(`/api/system/backups/${encodeURIComponent(b.name)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed: ' + (await errorText(res)));
      await loadBackups();
      setStatus({ ok: true, text: `Deleted ${b.name}.` });
    });
  };

  const exportCsv = () =>
    run(async () => {
      const get = async (url) => {
        const r = await authFetch(url);
        if (!r.ok) throw new Error('Export failed: ' + (await errorText(r)));
        return r.json();
      };
      const [tasks, projects, users] = await Promise.all([
        get('/api/tasks/'),
        get('/api/projects/'),
        get('/api/users/'),
      ]);
      const csv = tasksToCsv(tasks, buildProjectIndex(projects), users);
      const day = new Date().toISOString().slice(0, 10);
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `project-manager-tasks-${day}.csv`);
      setStatus({ ok: true, text: `Exported ${tasks.length} tasks.` });
    });

  return (
    <div className="settings-section">
      <h2>Backup &amp; export</h2>

      <div className="backup-row">
        <div>
          <strong>Export tasks</strong>
          <p className="settings-help">
            All tasks, including subtasks, done and archived ones, as a CSV file for Excel (semicolon-separated).
          </p>
        </div>
        <button className="btn btn-secondary btn-small" onClick={exportCsv} disabled={busy}>
          Export CSV
        </button>
      </div>

      {isAdmin && (
        <>
          <div className="backup-row">
            <div>
              <strong>Database backups</strong>
              <p className="settings-help">
                Full database dumps in <code>{backupDir || '…'}</code>. One is made automatically every night (if turned on below)
                and before every update, re-install and restore. <em>Restore</em> replaces all data with a backup; to move to a new server,
                download a backup here and upload it there.
              </p>
            </div>
            <div className="backup-actions">
              <button className="btn btn-primary btn-small" onClick={backupNow} disabled={busy}>
                {busy ? 'Working…' : 'Back up now'}
              </button>
              <button className="btn btn-secondary btn-small" onClick={() => uploadRef.current?.click()} disabled={busy}>
                Upload backup…
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
            Back up automatically every night (03:15)
          </label>

          <form className="archive-form" onSubmit={saveKeep}>
            <label htmlFor="backup-keep">Keep the newest</label>
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
            <span>backups of each kind (nightly / other)</span>
            <button type="submit" className="btn btn-primary btn-small" disabled={busy || String(savedKeep) === keep}>
              Save
            </button>
          </form>

          {backups && backups.length === 0 && <p className="settings-help backup-empty">No backups yet.</p>}
          {backups && backups.length > 0 && (
            <ul className="backup-list">
              {backups.map((b) => (
                <li key={b.name}>
                  <span className="backup-name">{b.name}</span>
                  <span className="backup-meta">
                    {new Date(b.created * 1000).toLocaleString()} · {formatSize(b.size)}
                  </span>
                  <span className="backup-buttons">
                    <button className="btn btn-secondary btn-small" onClick={() => download(b.name)} disabled={busy}>
                      Download
                    </button>
                    <button className="btn btn-secondary btn-small btn-danger" onClick={() => restore(b)} disabled={busy}>
                      Restore
                    </button>
                    <button
                      className="btn btn-secondary btn-small btn-danger"
                      onClick={() => remove(b)}
                      disabled={busy}
                      title="Delete this backup"
                    >
                      Delete
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
