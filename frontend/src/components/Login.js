import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Login.css';
import { t } from '../i18n';

function Login() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // null while loading; the Register tab only shows when sign-up is open.
  const [registrationOpen, setRegistrationOpen] = useState(null);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/auth/registration')
      .then((r) => (r.ok ? r.json() : { open: false }))
      .then((d) => {
        setRegistrationOpen(d.open);
        if (!d.open) setMode('login');
      })
      .catch(() => setRegistrationOpen(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>📋 Project Manager</h1>
        {registrationOpen && (
          <div className="login-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'login-tab active' : 'login-tab'}
              onClick={() => setMode('login')}
            >
              {t('Log In')}
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'login-tab active' : 'login-tab'}
              onClick={() => setMode('register')}
            >
              {t('Register')}
            </button>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>{t('Username')}</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label>{t('Email')}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          )}

          <div className="form-group">
            <label>{t('Password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
            {mode === 'register' && <small className="login-hint">{t('At least 8 characters.')}</small>}
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? t('Please wait...') : mode === 'login' ? t('Log In') : t('Create Account')}
          </button>
        </form>

        {registrationOpen === false && (
          <p className="login-note">{t('No account yet? Registration is closed — ask an admin to create one for you.')}</p>
        )}
      </div>
    </div>
  );
}

export default Login;
