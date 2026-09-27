import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getServer } from '../../desktop/server';
import { t } from '../../i18n';
import '../../styles/Login.css';
import '../../styles/Desktop.css';

// Windows app: first start (or after disconnecting) — which server, who.
function ConnectScreen() {
  const { connect } = useAuth();
  const navigate = useNavigate();
  const [server, setServer] = useState(getServer());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await connect(server, username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>📋 Project Manager</h1>
        <p className="connect-intro">
          {t(
            'Connect to your Project Manager server once. The app keeps a copy of your tasks, so you can keep working without a connection; changes are sent as soon as the server is reachable again.'
          )}
        </p>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={submit} className="login-form">
          <div className="form-group">
            <label htmlFor="connect-server">{t('Server')}</label>
            <input
              id="connect-server"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder={t('e.g. 192.168.1.20 or pm.example.com')}
              required
              autoFocus={!server}
            />
          </div>
          <div className="form-group">
            <label htmlFor="connect-user">{t('Username')}</label>
            <input
              id="connect-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus={!!server}
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label htmlFor="connect-password">{t('Password')}</label>
            <input
              id="connect-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t('Connecting…') : t('Connect')}
          </button>
        </form>
        <p className="login-note">
          {t('Your password is only used once, to create an app token; you can revoke it in the web app under Settings → API tokens.')}
        </p>
      </div>
    </div>
  );
}

export default ConnectScreen;
