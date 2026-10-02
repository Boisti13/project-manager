import React, { useEffect, useState } from 'react';
import { authFetch } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { t } from '../i18n';
import { copyText } from '../clipboard';

// Settings → Calendar feed: a private .ics link calendar apps subscribe to.
function CalendarFeedSettings() {
  const [path, setPath] = useState(null);
  const [scope, setScope] = useState('mine');
  const { workspaces } = useWorkspace();
  const [workspace, setWorkspace] = useState(''); // '' = all workspaces
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    authFetch('/api/v1/calendar/feed')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setPath(d.path))
      .catch((err) => setError(err.message));
  }, []);

  // A workspace that was deleted counts as "all".
  const workspaceId = workspaces.some((w) => String(w.id) === workspace) ? workspace : '';
  const query = new URLSearchParams();
  if (scope === 'all') query.set('scope', 'all');
  if (workspaceId) query.set('workspace', workspaceId);
  const url = path ? `${window.location.origin}${path}${query.toString() ? `?${query}` : ''}` : '';

  const copy = async () => {
    setCopied(await copyText(url)); // false: select it by hand
  };

  const reset = async () => {
    if (!window.confirm(t('Create a new link? Calendars subscribed to the old one stop updating until you give them the new link.'))) return;
    const res = await authFetch('/api/v1/calendar/feed/reset', { method: 'POST' });
    if (res.ok) {
      setPath((await res.json()).path);
      setCopied(false);
    } else setError(`HTTP ${res.status}`);
  };

  return (
    <div className="settings-section">
      <h2>{t('Calendar feed')}</h2>
      <p className="settings-help">
        {t(
          'Your open tasks with a deadline as a calendar your calendar app subscribes to — all-day entries, repeating tasks as series, updated about every hour. Keep the link private: anyone with it can see these tasks.'
        )}
      </p>
      {error && <p className="error-message">{error}</p>}
      {path && (
        <>
          <div className="archive-form">
            <label htmlFor="feed-scope">{t('Tasks')}</label>
            <select id="feed-scope" value={scope} onChange={(e) => { setScope(e.target.value); setCopied(false); }}>
              <option value="mine">{t('Mine and unassigned')}</option>
              <option value="all">{t('Everything I can see')}</option>
            </select>
            {workspaces.length > 0 && (
              <>
                <label htmlFor="feed-workspace">{t('Workspace')}</label>
                <select
                  id="feed-workspace"
                  value={workspaceId}
                  onChange={(e) => {
                    setWorkspace(e.target.value);
                    setCopied(false);
                  }}
                >
                  <option value="">{t('All workspaces')}</option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          {workspaceId && (
            <p className="settings-help">
              {t('One link per workspace: subscribe to each one you want, e.g. “Work” in Outlook and “Private” on your phone.')}
            </p>
          )}
          <div className="token-value feed-link">
            <code>{url}</code>
            <button type="button" className="btn btn-secondary btn-small" onClick={copy}>
              {copied ? t('Copied ✓') : t('Copy')}
            </button>
            <button type="button" className="btn btn-secondary btn-small btn-danger" onClick={reset}>
              {t('New link')}
            </button>
          </div>
          <ul className="settings-help feed-howto">
            <li>{t('Outlook (classic, Windows): File → Account Settings → Internet Calendars → New → paste the link.')}</li>
            <li>{t('iPhone / iPad: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar.')}</li>
            <li>{t('Android: the free app ICSx⁵ adds it to the phone’s calendar.')}</li>
            <li>{t('Mac: Calendar → File → New Calendar Subscription. Thunderbird: New Calendar → On the Network.')}</li>
          </ul>
          <p className="settings-help">
            {t(
              'Google Calendar, Outlook.com and the new Outlook fetch the feed from their own servers, which can’t reach a server on your private network or VPN — use an app that fetches on the device instead (as above).'
            )}
          </p>
        </>
      )}
    </div>
  );
}

export default CalendarFeedSettings;
