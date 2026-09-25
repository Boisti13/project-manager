import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import '../styles/UpdatePanel.css';

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
      setError('Check failed: ' + err.message);
    } finally {
      setChecking(false);
    }
  };

  const runUpdate = async () => {
    const switching = info && branch !== info.branch;
    const msg = switching
      ? `Switch from '${info.branch}' to '${branch}' and update? The app restarts and will be unavailable for a minute or two.`
      : `Update '${branch}' to ${check.target_commit}? The app restarts and will be unavailable for a minute or two.`;
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
      setError('Update failed to start: ' + err.message);
    }
  };

  const updating = updateState === 'running' || updateState === 'restarting';
  const canUpdate = isAdmin && check && check.branch === branch && check.update_available && !updating;

  return (
    <div className="settings-section">
      <h2>Updates</h2>
      {error && <div className="error-message">{error}</div>}

      {info && (
        <div className="settings-info">
          <div className="info-row">
            <span className="info-label">Running</span>
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
              <span className="info-label">Last commit</span>
              <span className="info-value update-commit-msg">{info.message}</span>
            </div>
          )}
        </div>
      )}

      {info && !info.is_git && <p className="update-note">Not a git checkout — updates are unavailable.</p>}

      {info?.is_git && (
        <div className="update-controls">
          <label className="update-branch">
            <span>Branch</span>
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
                  {b === info.branch ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary" onClick={runCheck} disabled={checking || updating || !branch}>
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
          {isAdmin && (
            <button
              className="btn btn-primary"
              onClick={runUpdate}
              disabled={!canUpdate}
              title={!check ? 'Check for updates first' : ''}
            >
              {branch !== info.branch ? `Switch to ${branch}` : 'Update now'}
            </button>
          )}
        </div>
      )}

      {branch && info?.branch && branch !== 'main' && (
        <p className="update-note update-warning">
          Production normally runs <code>main</code>. Other branches may contain unreleased work.
        </p>
      )}

      {check && check.branch === branch && (
        <div className={`update-result ${check.update_available ? 'update-available' : 'update-current'}`}>
          {!check.update_available ? (
            <strong>Up to date — running the latest commit on {check.branch}.</strong>
          ) : (
            <>
              <strong>
                {check.current_branch !== check.branch
                  ? `Switching to ${check.branch}`
                  : `${check.behind} new commit${check.behind === 1 ? '' : 's'} on ${check.branch}`}
                {check.target_version && ` · v${check.current_version} → v${check.target_version}`}
              </strong>
              {check.ahead > 0 && (
                <p className="update-note">
                  The running code has {check.ahead} commit{check.ahead === 1 ? '' : 's'} not on {check.branch}
                  {' '}— {check.ahead === 1 ? 'it' : 'they'} will no longer be running after the update.
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
              {!isAdmin && <p className="update-note">An admin can install this update.</p>}
            </>
          )}
        </div>
      )}

      {isAdmin && updateState && updateState !== 'idle' && (
        <div className="update-progress">
          <div className={`update-state update-state-${updateState}`}>
            {updateState === 'running' && 'Updating…'}
            {updateState === 'restarting' && 'Restarting services…'}
            {updateState === 'success' && 'Last update finished successfully.'}
            {updateState === 'failed' && 'Last update failed — see the log below.'}
            {updateState === 'success' && (
              <button className="btn btn-secondary btn-small" onClick={() => window.location.reload()}>
                Reload
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
