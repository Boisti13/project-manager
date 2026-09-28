import React, { useState } from 'react';
import { authFetch } from '../context/AuthContext';
import { copyText } from '../clipboard';
import { IS_DESKTOP } from '../desktop/platform';
import { getServer } from '../desktop';
import { openInBrowser } from './Markdown';
import { t } from '../i18n';

// Projects → 🔗: a read-only link to the project (/share/<token>) for someone
// without an account. Made on demand; "Stop sharing" makes the link dead.
function ProjectShare({ project, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const base = IS_DESKTOP ? getServer() : window.location.origin;
  const url = project.share_token ? `${base}/share/${project.share_token}` : null;

  const call = async (method) => {
    setBusy(true);
    try {
      const res = await authFetch(`/api/v1/projects/${project.id}/share`, { method });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      setCopied(false);
      await onChanged();
    } catch (err) {
      onError(t('Failed to save: {error}', { error: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    if (window.confirm(t('Stop sharing “{name}”? The link stops working for everyone who has it.', { name: project.name }))) {
      call('DELETE');
    }
  };

  return (
    <div className="project-share">
      <p>
        {t(
          'Anyone with the link sees this project’s categories and tasks — titles, descriptions, status, priorities, deadlines, estimates and labels — without logging in, and can’t change anything. Comments, history and who does what stay private.'
        )}
        {project.is_private && ' ' + t('This also applies to this private project.')}
      </p>
      {url ? (
        <div className="project-share-link">
          <code>{url}</code>
          <button type="button" className="btn btn-secondary btn-small" onClick={async () => setCopied(await copyText(url))}>
            {copied ? t('Copied ✓') : t('Copy')}
          </button>
          <a
            className="btn btn-secondary btn-small"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={openInBrowser ? (e) => openInBrowser(e, url) : undefined}
          >
            {t('Open link')}
          </a>
          <button type="button" className="btn btn-secondary btn-small btn-danger" onClick={stop} disabled={busy}>
            {t('Stop sharing')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-small" onClick={() => call('POST')} disabled={busy}>
          {t('Create link')}
        </button>
      )}
    </div>
  );
}

export default ProjectShare;
