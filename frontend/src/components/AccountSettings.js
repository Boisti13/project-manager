import React, { useState } from 'react';
import { authFetch } from '../context/AuthContext';

// Settings → Your account: change your own password.
function AccountSettings() {
  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  const [status, setStatus] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.repeat) {
      setStatus({ ok: false, text: "The new passwords don't match." });
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
      setStatus({ ok: true, text: 'Password changed.' });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-section">
      <h2>Your account</h2>
      <form className="account-form" onSubmit={submit}>
        <label>
          Current password
          <input type="password" value={form.current} onChange={set('current')} required autoComplete="current-password" />
        </label>
        <label>
          New password <small>(min. 8 characters)</small>
          <input type="password" value={form.next} onChange={set('next')} required minLength={8} autoComplete="new-password" />
        </label>
        <label>
          Repeat new password
          <input type="password" value={form.repeat} onChange={set('repeat')} required minLength={8} autoComplete="new-password" />
        </label>
        <div>
          <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
            Change password
          </button>
        </div>
      </form>
      {status && <p className={status.ok ? 'settings-ok' : 'error-message'}>{status.text}</p>}
    </div>
  );
}

export default AccountSettings;
