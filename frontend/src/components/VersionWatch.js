import React, { useEffect, useState } from 'react';
import { APP_VERSION } from '../version';
import { IS_DESKTOP } from '../desktop/platform';
import { t } from '../i18n';

const EVERY_MS = 10 * 60 * 1000;

// Web app: a tab left open while the server was updated still runs the old
// interface. Compares the server's version (on start, when the window gets
// focus, and every 10 minutes) with the one this page was built as, and
// offers a reload. The Windows app has its own check (desktop/SyncStatus).
function VersionWatch() {
  const [serverVersion, setServerVersion] = useState(null);
  const [later, setLater] = useState(null);

  useEffect(() => {
    if (IS_DESKTOP || !APP_VERSION) return undefined;
    const check = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) setServerVersion((await res.json()).version || null);
      } catch {
        // offline for a moment: next time
      }
    };
    check();
    window.addEventListener('focus', check);
    const timer = setInterval(check, EVERY_MS);
    return () => {
      window.removeEventListener('focus', check);
      clearInterval(timer);
    };
  }, []);

  if (!serverVersion || serverVersion === APP_VERSION || later === serverVersion) return null;
  return (
    <div className="version-banner" role="status">
      <span>{t('Project Manager was updated to version {version}.', { version: serverVersion })}</span>
      <button className="btn btn-primary btn-small" onClick={() => window.location.reload()}>
        {t('Reload')}
      </button>
      <button className="link-btn" onClick={() => setLater(serverVersion)}>
        {t('Later')}
      </button>
    </div>
  );
}

export default VersionWatch;
