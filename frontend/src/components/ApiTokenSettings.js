import React, { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../context/AuthContext';
import { parseServerDate } from '../taskFilters';
import { t, locale } from '../i18n';

const errorText = async (res) => {
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.detail) ? data.detail[0].msg : data.detail || `HTTP ${res.status}`;
};

const when = (value) => (value ? parseServerDate(value).toLocaleString(locale()) : '—');

// Settings → API tokens: personal tokens for scripts and other apps.
function ApiTokenSettings() {
  const [tokens, setTokens] = useState(null);
  const [name, setName] = useState('');
  const [days, setDays] = useState('');
  const [created, setCreated] = useState(null); // the new token, shown once
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    const res = await authFetch('/api/v1/auth/tokens/');
    if (res.ok) setTokens(await res.json());
    else setStatus({ ok: false, text: await errorText(res) });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setStatus(null);
    setCopied(false);
    const res = await authFetch('/api/v1/auth/tokens/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, expires_in_days: days ? parseInt(days, 10) : null }),
    });
    if (!res.ok) {
      setStatus({ ok: false, text: t('Could not create the token: {error}', { error: await errorText(res) }) });
      return;
    }
    setCreated(await res.json());
    setName('');
    await load();
  };

  const revoke = async (tok) => {
    if (!window.confirm(t('Revoke the token “{name}”? Apps using it lose access right away.', { name: tok.name }))) return;
    const res = await authFetch(`/api/v1/auth/tokens/${tok.id}`, { method: 'DELETE' });
    if (!res.ok) setStatus({ ok: false, text: await errorText(res) });
    if (created?.id === tok.id) setCreated(null);
    await load();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
    } catch {
      setCopied(false); // select it by hand
    }
  };

  const expired = (tok) => tok.expires_at && parseServerDate(tok.expires_at) < new Date();

  return (
    <div className="settings-section">
      <h2>{t('API tokens')}</h2>
      <p className="settings-help">
        {t(
          'Personal tokens let scripts and other apps use the API as you: send one as “Authorization: Bearer <token>”. A token can do everything you can, except manage tokens and change your password.'
        )}{' '}
        <a href="/api/docs" target="_blank" rel="noopener noreferrer">
          {t('Open API docs')}
        </a>
      </p>

      {created && (
        <div className="token-created" role="status">
          <strong>{t('New token “{name}” — copy it now, it won’t be shown again:', { name: created.name })}</strong>
          <div className="token-value">
            <code>{created.token}</code>
            <button type="button" className="btn btn-secondary btn-small" onClick={copy}>
              {copied ? t('Copied ✓') : t('Copy')}
            </button>
          </div>
        </div>
      )}

      {tokens && tokens.length === 0 && <p className="settings-help">{t('No tokens yet.')}</p>}
      {tokens && tokens.length > 0 && (
        <ul className="token-list">
          {tokens.map((tok) => (
            <li key={tok.id} className={expired(tok) ? 'expired' : ''}>
              <span className="token-name">
                {tok.name} <code>{tok.prefix}…</code>
              </span>
              <span className="token-meta">
                {t('created {date}', { date: when(tok.created_at) })} ·{' '}
                {tok.last_used_at ? t('last used {date}', { date: when(tok.last_used_at) }) : t('never used')} ·{' '}
                {tok.expires_at
                  ? expired(tok)
                    ? t('expired {date}', { date: when(tok.expires_at) })
                    : t('expires {date}', { date: when(tok.expires_at) })
                  : t('no expiry')}
              </span>
              <button type="button" className="btn btn-secondary btn-small btn-danger" onClick={() => revoke(tok)}>
                {t('Revoke')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="archive-form token-form" onSubmit={create}>
        <label htmlFor="token-name">{t('New token')}</label>
        <input
          id="token-name"
          type="text"
          className="token-name-input"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('e.g. Windows laptop')}
          required
        />
        <select value={days} onChange={(e) => setDays(e.target.value)} aria-label={t('Expiry')}>
          <option value="">{t('No expiry')}</option>
          <option value="30">{t('30 days')}</option>
          <option value="90">{t('90 days')}</option>
          <option value="365">{t('1 year')}</option>
        </select>
        <button type="submit" className="btn btn-primary btn-small" disabled={!name.trim()}>
          {t('Create token')}
        </button>
      </form>
      {status && <p className={status.ok ? 'settings-ok' : 'error-message'}>{status.text}</p>}
    </div>
  );
}

export default ApiTokenSettings;
