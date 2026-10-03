import React, { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { copyText } from '../clipboard';
import { IS_DESKTOP } from '../desktop/platform';
import { getServer } from '../desktop/server';
import { t } from '../i18n';

const DOCS = 'https://github.com/Boisti13/project-manager/blob/main/docs/home-assistant.md';

const call = async (url, method = 'GET', body) => {
  const res = await authFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((d) => d.loc[d.loc.length - 1]).join(', ') : data.detail;
    throw new Error(detail ? t(detail) : `HTTP ${res.status}`);
  }
  return data;
};

/** configuration.yaml for Home Assistant's REST sensor, reading GET /api/v1/summary. */
export function restYaml(url) {
  return `rest:
  - resource: ${url}
    headers:
      Authorization: !secret project_manager_token
    scan_interval: 60
    sensor:
      - name: "Tasks overdue"
        unique_id: project_manager_overdue
        value_template: "{{ value_json.overdue }}"
        json_attributes: [overdue_tasks]
      - name: "Tasks due today"
        unique_id: project_manager_due_today
        value_template: "{{ value_json.due_today }}"
        json_attributes: [due_today_tasks]
      - name: "Tasks due soon"
        unique_id: project_manager_due_soon
        value_template: "{{ value_json.due_soon }}"
        json_attributes: [due_soon_tasks]
      - name: "Task notifications"
        unique_id: project_manager_unread
        value_template: "{{ value_json.unread_notifications }}"
        json_attributes: [latest_notification]

# secrets.yaml:
# project_manager_token: "Bearer pm_…your API token…"`;
}

/** The broker settings, for admins (stored on the server; the password isn't shown again). */
function BrokerSettings({ onSaved }) {
  const [form, setForm] = useState(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null); // { connected, last_error }
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await call('/api/v1/home-assistant/mqtt');
      setForm(data.settings);
      setStatus(data.status);
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // While it's on, look again after a moment: connecting takes a second.
  useEffect(() => {
    if (!form?.enabled) return undefined;
    const timer = setTimeout(load, 3000);
    return () => clearTimeout(timer);
  }, [form, load]);

  if (!form) return message ? <p className="error-message">{message.text}</p> : null;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const body = () => {
    const { password_set: _unused, ...rest } = form;
    return password ? { ...rest, password } : rest;
  };
  const run = async (fn) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
    setBusy(false);
  };
  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const data = await call('/api/v1/home-assistant/mqtt', 'PUT', body());
      setForm(data.settings);
      setStatus(data.status);
      setPassword('');
      setMessage({ ok: true, text: t('Saved.') });
      onSaved();
    });
  };
  const test = () =>
    run(async () => {
      const { ok, error } = await call('/api/v1/home-assistant/mqtt/test', 'POST', body());
      setMessage(ok ? { ok: true, text: t('✓ The broker accepts these settings.') } : { ok: false, text: t('Can’t connect: {error}', { error }) });
    });

  return (
    <form className="ha-broker" onSubmit={save}>
      <h3>{t('MQTT broker (admins)')}</h3>
      <label className="ha-check">
        <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        {t('Send to Home Assistant over MQTT')}
      </label>
      <div className="ha-grid">
        <label>
          {t('Broker address')}
          <input value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="192.168.178.108" />
        </label>
        <label>
          {t('Port')}
          <input type="number" min="1" max="65535" value={form.port} onChange={(e) => set('port', parseInt(e.target.value, 10) || 1883)} />
        </label>
        <label>
          {t('Username')}
          <input value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" />
        </label>
        <label>
          {t('Password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={form.password_set ? t('(unchanged)') : ''}
            autoComplete="new-password"
          />
        </label>
        <label>
          {t('Topic')}
          <input value={form.topic} onChange={(e) => set('topic', e.target.value)} />
        </label>
        <label>
          {t('Discovery prefix')}
          <input value={form.discovery_prefix} onChange={(e) => set('discovery_prefix', e.target.value)} />
        </label>
        <label>
          {t('Daily deadline reminder at')}
          <input type="time" value={form.reminder_time} onChange={(e) => set('reminder_time', e.target.value)} />
        </label>
        <label>
          {t('Address of this app (for links)')}
          <input value={form.app_url} onChange={(e) => set('app_url', e.target.value)} placeholder={IS_DESKTOP ? getServer() || '' : window.location.origin} />
        </label>
      </div>
      <label className="ha-check">
        <input type="checkbox" checked={form.tls} onChange={(e) => set('tls', e.target.checked)} />
        {t('TLS (usually port 8883)')}
      </label>
      <div className="archive-form">
        <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
          {t('Save')}
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={test} disabled={busy || !form.host.trim()}>
          {t('Test connection')}
        </button>
        {form.enabled && status && (
          <span className={status.connected ? 'settings-ok' : 'ha-status-off'}>
            {status.connected
              ? t('● Connected')
              : status.last_error
              ? t('○ Not connected: {error}', { error: status.last_error })
              : t('○ Connecting…')}
          </span>
        )}
      </div>
      {status && (
        <p className="settings-help">
          {t('The reminder goes by the server’s clock: it’s {time} there now ({zone}). Empty: no daily reminder.', {
            time: status.server_time,
            zone: status.server_timezone,
          })}
        </p>
      )}
      {message && <p className={message.ok ? 'settings-ok' : 'error-message'}>{message.text}</p>}
    </form>
  );
}

// Settings → Home Assistant: let Home Assistant poll your numbers (REST
// sensor with an API token), and/or have them pushed over MQTT.
function HomeAssistantSettings() {
  const { currentUser } = useAuth();
  const { workspaces } = useWorkspace();
  const [me, setMe] = useState(null);
  const [pollWorkspace, setPollWorkspace] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const loadMe = useCallback(async () => {
    try {
      setMe(await call('/api/v1/home-assistant/me'));
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => {
    loadMe();
  }, [loadMe]);

  // Shown right away, put back if the server says no.
  const saveMe = async (patch) => {
    setError(null);
    const before = me;
    setMe({ ...me, ...patch });
    try {
      setMe(await call('/api/v1/home-assistant/me', 'PUT', { enabled: me.enabled, workspace_id: me.workspace_id, ...patch }));
    } catch (err) {
      setMe(before);
      setError(err.message);
    }
  };

  const origin = IS_DESKTOP ? getServer() || '' : window.location.origin;
  const pollId = workspaces.some((w) => String(w.id) === pollWorkspace) ? pollWorkspace : '';
  const url = `${origin}/api/v1/summary/${pollId ? `?workspace=${pollId}` : ''}`;
  const yaml = restYaml(url);

  return (
    <div className="settings-section">
      <h2>{t('Home Assistant')}</h2>
      <p className="settings-help">
        {t(
          'Your tasks and notifications in Home Assistant: overdue and due-today counts with the task lists, unread notifications, and events for automations (e.g. a push to your phone when someone assigns you a task). Home Assistant can fetch them (always available) or get them pushed over MQTT.'
        )}{' '}
        <a href={DOCS} target="_blank" rel="noopener noreferrer">
          {t('Guide with examples')}
        </a>
      </p>

      <h3>{t('Let Home Assistant fetch them (REST)')}</h3>
      <ol className="settings-help ha-steps">
        <li>{t('Create an API token under Settings → Account → API tokens (e.g. named “Home Assistant”).')}</li>
        <li>
          {t('In Home Assistant’s secrets.yaml:')} <code>project_manager_token: "Bearer pm_…"</code>
        </li>
        <li>{t('Add this to configuration.yaml and restart Home Assistant:')}</li>
      </ol>
      {workspaces.length > 0 && (
        <div className="archive-form">
          <label htmlFor="ha-poll-ws">{t('Workspace')}</label>
          <select id="ha-poll-ws" value={pollId} onChange={(e) => { setPollWorkspace(e.target.value); setCopied(false); }}>
            <option value="">{t('All workspaces')}</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <pre className="ha-yaml">{yaml}</pre>
      <button type="button" className="btn btn-secondary btn-small" onClick={async () => setCopied(await copyText(yaml))}>
        {copied ? t('Copied ✓') : t('Copy')}
      </button>
      <p className="settings-help">
        {t('Home Assistant must be able to reach this address. With HTTPS and the server’s own CA, add verify_ssl: false or trust the CA there.')}
      </p>

      <h3>{t('Push over MQTT')}</h3>
      {me && !me.available && (
        <p className="settings-help">
          {currentUser?.is_admin ? t('MQTT is off — set up the broker below.') : t('MQTT is off. An admin can switch it on.')}
        </p>
      )}
      {me && me.available && (
        <>
          <label className="ha-check">
            <input type="checkbox" checked={me.enabled} onChange={(e) => saveMe({ enabled: e.target.checked })} />
            {t('Send my notifications and task numbers to Home Assistant')}
          </label>
          {me.enabled && (
            <>
              {workspaces.length > 0 && (
                <div className="archive-form">
                  <label htmlFor="ha-mqtt-ws">{t('Workspace')}</label>
                  <select
                    id="ha-mqtt-ws"
                    value={me.workspace_id ?? ''}
                    onChange={(e) => saveMe({ workspace_id: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <option value="">{t('All workspaces')}</option>
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="settings-help">
                {t('In Home Assistant: the device “Project Manager ({name})” with its sensors and the event entity for automations. Topics: {topic}/state and {topic}/event.', {
                  name: currentUser?.username,
                  topic: me.topic,
                })}
              </p>
            </>
          )}
        </>
      )}
      {error && <p className="error-message">{error}</p>}
      {currentUser?.is_admin && <BrokerSettings onSaved={loadMe} />}
    </div>
  );
}

export default HomeAssistantSettings;
