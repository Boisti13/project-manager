import React, { useState } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import { t, LANGUAGES } from '../i18n';

// Settings → Your account: interface language, change your own password.
function AccountSettings() {
  const { currentUser, updateCurrentUser } = useAuth();
  const [langStatus, setLangStatus] = useState(null);

  const setLanguagePreference = async (value) => {
    setLangStatus(null);
    try {
      const res = await authFetch('/api/auth/me/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: value || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      updateCurrentUser(await res.json()); // re-renders the app in the new language
    } catch (err) {
      setLangStatus(t('Could not save: {error}', { error: err.message }));
    }
  };

  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  const [status, setStatus] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.repeat) {
      setStatus({ ok: false, text: t("The new passwords don't match.") });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: form.current, new_password: form.next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(Array.isArray(data.detail) ? data.detail[0].msg : data.detail || `HTTP ${res.status}`);
      }
      setForm({ current: '', next: '', repeat: '' });
      setStatus({ ok: true, text: t('Password changed.') });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-section">
      <h2>{t('Your account')}</h2>
      <form className="archive-form language-form" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="ui-language">{t('Language')}</label>
        <select
          id="ui-language"
          value={currentUser?.language || ''}
          onChange={(e) => setLanguagePreference(e.target.value)}
        >
          <option value="">{t('Automatic (browser language)')}</option>
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </form>
      {langStatus && <p className="error-message">{langStatus}</p>}
      <form className="account-form" onSubmit={submit}>
        <label>
          {t('Current password')}
          <input type="password" value={form.current} onChange={set('current')} required autoComplete="current-password" />
        </label>
        <label>
          {t('New password')} <small>{t('(min. 8 characters)')}</small>
          <input type="password" value={form.next} onChange={set('next')} required minLength={8} autoComplete="new-password" />
        </label>
        <label>
          {t('Repeat new password')}
          <input type="password" value={form.repeat} onChange={set('repeat')} required minLength={8} autoComplete="new-password" />
        </label>
        <div>
          <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
            {t('Change password')}
          </button>
        </div>
      </form>
      {status && <p className={status.ok ? 'settings-ok' : 'error-message'}>{status.text}</p>}
    </div>
  );
}

export default AccountSettings;
