import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { engine, getServer } from '../../desktop';
import { DESKTOP_VERSION } from '../../desktop/platform';
import { parseServerDate } from '../../taskFilters';
import { t, tn, locale } from '../../i18n';
import '../../styles/Desktop.css';

const fieldNames = {
  title: () => t('Title'), description: () => t('Description'), status: () => t('Status'),
  priority: () => t('Priority'), deadline: () => t('Deadline'), project_id: () => t('Project'),
  assignee_id: () => t('Assign To'), label_ids: () => t('Labels'), blocked_by_ids: () => t('Waits for'),
  recurrence_unit: () => t('Repeat'), recurrence_interval: () => t('Repeat'), order: () => t('Sort'),
};

// Settings → Windows app: connection, sync state, changes that couldn't be saved.
function DesktopSettings() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [s, setS] = useState(engine.status());
  useEffect(() => engine.subscribe((status) => setS(status)), []);

  const when = (value) => (value ? parseServerDate(value).toLocaleString(locale()) : '—');

  const disconnect = async () => {
    const warning = s.pending
      ? tn(s.pending, 'One change hasn’t been sent to the server yet and will be lost. ', '{n} changes haven’t been sent to the server yet and will be lost. ')
      : '';
    if (!window.confirm(warning + t('Disconnect this app and delete its local copy of the data?'))) return;
    await logout({ wipe: true });
    navigate('/login', { replace: true });
  };

  const signInAgain = async () => {
    await logout({ wipe: false }); // keep the local copy and queued changes
    navigate('/login', { replace: true });
  };

  return (
    <div className="settings-section">
      <h2>{t('Windows app')}</h2>
      <div className="settings-info">
        <div className="info-row">
          <span className="info-label">{t('Server')}</span>
          <span className="info-value">{getServer()}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t('Connected as')}</span>
          <span className="info-value">{currentUser?.username}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t('Status')}</span>
          <span className="info-value">
            {s.authError ? t('Signed out by the server (token revoked?)') : s.online === false ? t('Offline') : t('Online')}
            {' · '}
            {tn(s.pending, 'one change waiting', '{n} changes waiting')}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">{t('Last sync')}</span>
          <span className="info-value">{when(s.lastSync)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t('App version')}</span>
          <span className="info-value">{DESKTOP_VERSION}</span>
        </div>
      </div>

      {s.error && <p className="error-message">{t('Sync failed: {error}', { error: s.error })}</p>}

      {s.conflicts.length > 0 && (
        <div className="sync-conflicts">
          <strong>{t('Changes that couldn’t be saved')}</strong>
          <p className="settings-help">
            {t('Someone changed the same thing on the server while you were offline, so the server’s version was kept. Check these and change them again if needed.')}
          </p>
          <ul>
            {s.conflicts.map((c, i) => (
              <li key={i}>
                <strong>{c.title || t('(untitled)')}</strong>{' '}
                {c.kind === 'conflict'
                  ? t('— changed on the server meanwhile: {fields}', {
                      fields: Object.keys(c.fields || {}).map((f) => (fieldNames[f] ? fieldNames[f]() : f)).join(', '),
                    })
                  : t('— not saved: {reason}', { reason: c.detail })}
                <span className="sync-conflict-time"> · {when(c.at)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => engine.dismissConflicts()}>
            {t('Dismiss')}
          </button>
        </div>
      )}

      <div className="desktop-actions">
        <button type="button" className="btn btn-primary btn-small" onClick={() => engine.sync()} disabled={s.syncing}>
          {s.syncing ? t('Syncing…') : t('Sync now')}
        </button>
        {s.authError && (
          <button type="button" className="btn btn-secondary btn-small" onClick={signInAgain}>
            {t('Sign in again')}
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-small btn-danger" onClick={disconnect}>
          {t('Disconnect…')}
        </button>
      </div>
    </div>
  );
}

export default DesktopSettings;
