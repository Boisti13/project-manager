import React, { useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { nextWorkspaceId } from '../workspaces';
import { t } from '../i18n';

const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Which workspace the app shows (top bar); only there once the user has one. W switches to the next. */
function WorkspaceSwitcher() {
  const { workspaces, current, setCurrent } = useWorkspace();

  useEffect(() => {
    if (!workspaces.length) return undefined;
    const onKey = (e) => {
      if (e.key !== 'w' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      setCurrent(nextWorkspaceId(workspaces, current?.id ?? null));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspaces, current, setCurrent]);

  if (!workspaces.length) return null;
  return (
    <select
      className="workspace-switcher"
      value={current?.id ?? ''}
      onChange={(e) => setCurrent(e.target.value === '' ? null : Number(e.target.value))}
      style={current?.color ? { '--ws-color': current.color } : undefined}
      title={t('Workspace (W switches)')}
      aria-label={t('Workspace')}
    >
      <option value="">{t('All workspaces')}</option>
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}

export default WorkspaceSwitcher;
