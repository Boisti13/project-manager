import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { engine } from '../../desktop';
import { checkForUpdate, subscribeUpdates, updateStatus } from '../../desktop/updater';
import { timeAgo } from '../TaskComments';
import { t, tn } from '../../i18n';
import '../../styles/Desktop.css';
import { compareFeatures } from '../../version';

// Windows app, in the navigation bar: online/offline, unsent changes, last
// sync. Click to sync now; problems lead to Settings.
function SyncStatus() {
  const [s, setS] = useState(engine.status());
  const navigate = useNavigate();

  useEffect(() => engine.subscribe((status) => setS(status)), []);
  // Keep "2 min ago" fresh.
  useEffect(() => {
    const timer = setInterval(() => setS(engine.status()), 30000);
    return () => clearInterval(timer);
  }, []);

  // New app versions: look on start and every six hours.
  const [u, setU] = useState(updateStatus());
  useEffect(() => {
    const off = subscribeUpdates(setU);
    checkForUpdate();
    const timer = setInterval(checkForUpdate, 6 * 60 * 60 * 1000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);

  const problems = s.conflicts.length;
  const gap = compareFeatures(s.serverVersion);
  let tone = 'ok';
  let text;
  if (s.authError) {
    tone = 'bad';
    text = t('Sign in again');
  } else if (s.syncing) {
    tone = 'busy';
    text = t('Syncing…');
  } else if (s.online === false) {
    tone = 'off';
    text = s.pending ? tn(s.pending, 'Offline · one change waiting', 'Offline · {n} changes waiting') : t('Offline');
  } else if (s.pending) {
    tone = 'busy';
    text = tn(s.pending, 'one change waiting', '{n} changes waiting');
  } else {
    text = s.lastSync ? t('Synced {when}', { when: timeAgo(s.lastSync) }) : t('Not synced yet');
  }

  return (
    <span className="sync-status">
      <button
        type="button"
        className={`sync-pill sync-${tone}`}
        onClick={() => (s.authError ? navigate('/settings/app') : engine.sync())}
        title={t('Sync now')}
      >
        <span className="sync-dot" aria-hidden="true" />
        <span className="sync-text">{text}</span>
      </button>
      {problems > 0 && (
        <button type="button" className="sync-pill sync-bad" onClick={() => navigate('/settings/app')}>
          ⚠ {tn(problems, 'one change not saved', '{n} changes not saved')}
        </button>
      )}
      {u.available && (
        <button type="button" className="sync-pill sync-update" onClick={() => navigate('/settings/app')}>
          ⬆ {t('Update {version}', { version: u.available.version })}
        </button>
      )}
      {/* The server has features this app's interface doesn't (and no app update to get them yet), or the other way round. */}
      {gap === 'server-newer' && !u.available && (
        <button
          type="button"
          className="sync-pill sync-warn"
          onClick={() => navigate('/settings/app')}
          title={t('The server runs version {version}, which has features this app doesn’t show yet.', { version: s.serverVersion })}
        >
          ⚠ {t('App older than the server')}
        </button>
      )}
      {gap === 'server-older' && (
        <button
          type="button"
          className="sync-pill sync-warn"
          onClick={() => navigate('/settings/app')}
          title={t('The server runs version {version}; some features of this app need a newer one.', { version: s.serverVersion })}
        >
          ⚠ {t('Server older than the app')}
        </button>
      )}
    </span>
  );
}

export default SyncStatus;
