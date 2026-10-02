import React, { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../context/AuthContext';
import { copyText } from '../clipboard';
import { t, tn } from '../i18n';

const call = async (url, body) => {
  const res = await authFetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? t(data.detail) : `HTTP ${res.status}`);
  return data;
};

/** Recovery codes, shown once after turning on or renewing. */
function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="twofa-codes">
      <p className="settings-help">
        <strong>{t('Save these recovery codes now')}</strong>{' '}
        {t('(password manager, or printed). Each one logs you in once without the app — for when your phone is lost. They won’t be shown again.')}
      </p>
      <ul>
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-secondary btn-small" onClick={async () => setCopied(await copyText(codes.join('\n')))}>
        {copied ? t('Copied ✓') : t('Copy')}
      </button>{' '}
      <button type="button" className="btn btn-primary btn-small" onClick={onDone}>
        {t('I’ve saved them')}
      </button>
    </div>
  );
}

// Settings → Two-factor login: a code from an authenticator app on top of the
// password (backend app/two_factor.py). Off -> setup (QR code, confirm with a
// code) -> on, with recovery codes; turning off or new codes need the password.
function TwoFactorSettings() {
  const [state, setState] = useState(null); // { enabled, recovery_left }
  const [setup, setSetup] = useState(null); // { secret, uri, qr_svg }
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null); // recovery codes to show
  const [confirm, setConfirm] = useState(null); // 'off' | 'codes': asking for the password
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await call('/api/v1/auth/2fa'));
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setStatus(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    }
    setBusy(false);
  };

  const start = () => run(async () => setSetup(await call('/api/v1/auth/2fa/setup', {})));

  const enable = (e) => {
    e.preventDefault();
    run(async () => {
      const { recovery_codes: list } = await call('/api/v1/auth/2fa/enable', { code });
      setSetup(null);
      setCode('');
      setCodes(list);
      await load();
    });
  };

  const withPassword = (e) => {
    e.preventDefault();
    run(async () => {
      if (confirm === 'off') {
        await call('/api/v1/auth/2fa/disable', { password });
        setStatus({ ok: true, text: t('Two-factor login is off.') });
      } else {
        setCodes((await call('/api/v1/auth/2fa/recovery-codes', { password })).recovery_codes);
      }
      setConfirm(null);
      setPassword('');
      await load();
    });
  };

  return (
    <div className="settings-section">
      <h2>{t('Two-factor login')}</h2>
      <p className="settings-help">
        {t(
          'On top of your password, logging in asks for a code from an authenticator app on your phone (e.g. Google or Microsoft Authenticator, Aegis, 2FAS, or your password manager). Someone who learns your password still can’t get in. API tokens, the Windows/Linux app and the calendar feed keep working.'
        )}
      </p>

      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}

      {state && !state.enabled && !setup && !codes && (
        <button type="button" className="btn btn-primary btn-small" onClick={start} disabled={busy}>
          {t('Set up two-factor login')}
        </button>
      )}

      {setup && (
        <form className="twofa-setup" onSubmit={enable}>
          <ol className="settings-help">
            <li>{t('Scan the code with your authenticator app (“Add account”, “+”).')}</li>
            <li>
              {t('Can’t scan? Enter this key in the app instead:')} <code className="twofa-secret">{setup.secret}</code>
            </li>
            <li>{t('Enter the 6-digit code the app shows:')}</li>
          </ol>
          {/* The server's own QR code of the otpauth:// link (segno). */}
          <div className="twofa-qr" dangerouslySetInnerHTML={{ __html: setup.qr_svg }} />
          <div className="archive-form">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              aria-label={t('Code from your authenticator app')}
              required
              autoFocus
            />
            <button type="submit" className="btn btn-primary btn-small" disabled={busy || !code.trim()}>
              {t('Turn on')}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setSetup(null)}>
              {t('Cancel')}
            </button>
          </div>
        </form>
      )}

      {state?.enabled && !codes && (
        <>
          <p className="settings-ok">
            {t('✓ Two-factor login is on.')}{' '}
            {tn(state.recovery_left, 'One recovery code left.', '{n} recovery codes left.')}
          </p>
          {confirm ? (
            <form className="archive-form" onSubmit={withPassword}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('Your password')}
                aria-label={t('Your password')}
                autoComplete="current-password"
                required
                autoFocus
              />
              <button type="submit" className={`btn btn-small ${confirm === 'off' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
                {confirm === 'off' ? t('Turn off') : t('New recovery codes')}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirm(null)}>
                {t('Cancel')}
              </button>
            </form>
          ) : (
            <div className="archive-form">
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirm('codes')}>
                {t('New recovery codes')}
              </button>
              <button type="button" className="btn btn-secondary btn-small btn-danger" onClick={() => setConfirm('off')}>
                {t('Turn off')}
              </button>
            </div>
          )}
        </>
      )}
      {status && <p className={status.ok ? 'settings-ok' : 'error-message'}>{status.text}</p>}
    </div>
  );
}

export default TwoFactorSettings;
