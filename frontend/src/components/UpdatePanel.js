import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import '../styles/UpdatePanel.css';
import { t, tn } from '../i18n';

const POLL_MS = 2000;

const parseApiError = async (response) => {
  try {
    const data = await response.json();
    return data.detail || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

function UpdatePanel() {
  const { currentUser } = useAuth();
  const isAdmin = !!currentUser?.is_admin;

  const [info, setInfo] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [updateState, setUpdateState] = useState(null);
  const [log, setLog] = useState('');
  const pollRef = useRef(null);
  const logRef = useRef(null);

  const stopPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const pollStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/system/update/status');
      if (!res.ok) return; // backend is restarting mid-update; try again next tick
      const data = await res.json();
      setUpdateState(data.state);
      setLog(data.log);
      if (data.state === 'success' || data.state === 'failed') stopPolling();
    } catch {
      // same as above: connection refused while the backend restarts
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollStatus();
    pollRef.current = setInterval(pollStatus, POLL_MS);
  }, [pollStatus]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch('/api/system/info');
        if (!res.ok) throw new Error(await parseApiError(res));
        const data = await res.json();
        setInfo(data);
        if (!data.is_git) return;

        const bres = await authFetch('/api/system/branches');
        if (!bres.ok) throw new Error(await parseApiError(bres));
        const list = await bres.json();
        setBranches(list);
        setBranch(list.includes(data.branch) ? data.branch : list.includes('main') ? 'main' : list[0] || '');
      } catch (err) {
        setError(err.message);
      }
    };
    load();

    if (isAdmin) {
      authFetch('/api/system/update/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          setUpdateState(data.state);
          setLog(data.log);
          if (data.state === 'running' || data.state === 'restarting') startPolling();
        })
        .catch(() => {});
    }
    return stopPolling;
  }, [isAdmin, startPolling]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const runCheck = async () => {
    setChecking(true);
    setError(null);
    setCheck(null);
    try {
      const res = await authFetch(`/api/system/check?branch=${encodeURIComponent(branch)}`);
      if (!res.ok) throw new Error(await parseApiError(res));
      setCheck(await res.json());
    } catch (err) {
      setError(t('Check failed: {error}', { error: err.message }));
    } finally {
      setChecking(false);
    }
  };

  const runUpdate = async () => {
    const switching = info && branch !== info.branch;
    const msg = switching
      ? t("Switch from '{from}' to '{to}' and update? The app restarts and will be unavailable for a minute or two.", {
          from: info.branch,
          to: branch,
        })
      : t("Update '{branch}' to {commit}? The app restarts and will be unavailable for a minute or two.", {
          branch,
          commit: check.target_commit,
        });
    if (!window.confirm(msg)) return;

    setError(null);
    try {
      const res = await authFetch('/api/system/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      setUpdateState('running');
      setLog('');
      startPolling();
    } catch (err) {
      setError(t('Update failed to start: {error}', { error: err.message }));
    }
  };

  const updating = updateState === 'running' || updateState === 'restarting';
  const canUpdate = isAdmin && check && check.branch === branch && check.update_available && !updating;

  return (
    <div className="settings-section">
      <h2>{t('Updates')}</h2>
      {error && <div className="error-message">{error}</div>}

      {info && (
        <div className="settings-info">
          <div className="info-row">
            <span className="info-label">{t('Running')}</span>
            <span className="info-value">
              v{info.version || '?'}
              {info.branch && (
                <>
                  {' · '}
                  <code>{info.branch}</code> @ <code>{info.commit}</code>
                </>
              )}
            </span>
          </div>
          {info.message && (
            <div className="info-row">
              <span className="info-label">{t('Last commit')}</span>
              <span className="info-value update-commit-msg">{info.message}</span>
            </div>
          )}
        </div>
      )}

      {info && !info.is_git && <p className="update-note">{t('Not a git checkout — updates are unavailable.')}</p>}

      {info?.is_git && (
        <div className="update-controls">
          <label className="update-branch">
            <span>{t('Branch')}</span>
            <select
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setCheck(null);
              }}
              disabled={updating || branches.length === 0}
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                  {b === info.branch ? ` ${t('(current)')}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary" onClick={runCheck} disabled={checking || updating || !branch}>
            {checking ? t('Checking…') : t('Check for updates')}
          </button>
          {isAdmin && (
            <button
              className="btn btn-primary"
              onClick={runUpdate}
              disabled={!canUpdate}
              title={!check ? t('Check for updates first') : ''}
            >
              {branch !== info.branch ? t('Switch to {branch}', { branch }) : t('Update now')}
            </button>
          )}
        </div>
      )}

      {branch && info?.branch && branch !== 'main' && (
        <p className="update-note update-warning">
          {t('Production normally runs “main”. Other branches may contain unreleased work.')}
        </p>
      )}

      {check && check.branch === branch && (
        <div className={`update-result ${check.update_available ? 'update-available' : 'update-current'}`}>
          {!check.update_available ? (
            <strong>{t('Up to date — running the latest commit on {branch}.', { branch: check.branch })}</strong>
          ) : (
            <>
              <strong>
                {check.current_branch !== check.branch
                  ? t('Switch to {branch}', { branch: check.branch }) +
                    (check.behind === 0 && check.ahead === 0 ? ` ${t('(same code, only the branch changes)')}` : '')
                  : tn(check.behind, 'one new commit on {branch}', '{n} new commits on {branch}', { branch: check.branch })}
                {check.target_version &&
                  check.target_version !== check.current_version &&
                  ` · v${check.current_version} → v${check.target_version}`}
              </strong>
              {check.ahead > 0 && (
                <p className="update-note">
                  {tn(
                    check.ahead,
                    'The running code has one commit not on {branch} — it will no longer be running after the update.',
                    'The running code has {n} commits not on {branch} — they will no longer be running after the update.',
                    { branch: check.branch }
                  )}
                </p>
              )}
              {check.commits.length > 0 && (
                <ul className="update-commits">
                  {check.commits.map((c) => (
                    <li key={c.commit}>
                      <code>{c.commit}</code> {c.message}
                    </li>
                  ))}
                </ul>
              )}
              {!isAdmin && <p className="update-note">{t('An admin can install this update.')}</p>}
            </>
          )}
        </div>
      )}

      {isAdmin && updateState && updateState !== 'idle' && (
        <div className="update-progress">
          <div className={`update-state update-state-${updateState}`}>
            {updateState === 'running' && t('Updating…')}
            {updateState === 'restarting' && t('Restarting services…')}
            {updateState === 'success' && t('Last update finished successfully.')}
            {updateState === 'failed' && t('Last update failed — see the log below.')}
            {updateState === 'success' && (
              <button className="btn btn-secondary btn-small" onClick={() => window.location.reload()}>
                {t('Reload')}
              </button>
            )}
          </div>
          {log && (
            <pre className="update-log" ref={logRef}>
              {log}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default UpdatePanel;
