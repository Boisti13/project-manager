import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { authFetch, useAuth } from '../context/AuthContext';
import UserManagement from './UserManagement';
import UpdatePanel from './UpdatePanel';
import ArchiveSettings from './ArchiveSettings';
import AccountSettings from './AccountSettings';
import BackupSettings from './BackupSettings';
import LabelSettings from './LabelSettings';
import ApiTokenSettings from './ApiTokenSettings';
import CalendarFeedSettings from './CalendarFeedSettings';
import DesktopSettings from './desktop/DesktopSettings';
import AppDownloads from './AppDownloads';
import { IS_DESKTOP, DESKTOP_OS } from '../desktop/platform';
import '../styles/Settings.css';
import { t } from '../i18n';
import TemplateSettings from './TemplateSettings';
import WorkspaceSettings from './WorkspaceSettings';
import TwoFactorSettings from './TwoFactorSettings';
import HomeAssistantSettings from './HomeAssistantSettings';

// Settings → About: a few numbers, the version, how you're connected.
function About() {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState({ tasks: 0, projects: 0, users: 0 });
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [tasks, projects, users] = await Promise.all([
          authFetch('/api/tasks/').then((r) => r.json()),
          authFetch('/api/projects/').then((r) => r.json()),
          authFetch('/api/users/').then((r) => r.json()),
        ]);
        setStats({ tasks: tasks.length, projects: projects.length, users: users.length });
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    };
    loadStats();

    authFetch('/api/health')
      .then((r) => r.json())
      .then((d) => setVersion(d.version))
      .catch(() => setVersion(null));
  }, []);

  return (
    <>
      <div className="settings-section">
        <h2>{t('Overview')}</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{loading ? '—' : stats.tasks}</span>
            <span className="stat-label">{t('Tasks')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{loading ? '—' : stats.projects}</span>
            <span className="stat-label">{t('Projects')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{loading ? '—' : stats.users}</span>
            <span className="stat-label">{t('Users')}</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2>{t('About')}</h2>
        <div className="settings-info">
          <div className="info-row">
            <span className="info-label">{t('Logged in as')}</span>
            <span className="info-value">{currentUser?.username} ({currentUser?.email})</span>
          </div>
          <div className="info-row">
            <span className="info-label">{t('Application')}</span>
            <span className="info-value">Project Manager{version ? ` v${version}` : ''}</span>
          </div>
          <div className="info-row">
            <span className="info-label">{t('Connection')}</span>
            <span className="info-value">
              {window.location.protocol === 'https:' ? (
                <>
                  {t('🔒 HTTPS (encrypted)')} ·{' '}
                  <a href="/ca.crt" download="project-manager-ca.crt">
                    {t('CA certificate')}
                  </a>
                </>
              ) : (
                t('⚠ HTTP (not encrypted)')
              )}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">{t('Stack')}</span>
            <span className="info-value">FastAPI + React + PostgreSQL</span>
          </div>
          <div className="info-row">
            <span className="info-label">{t('Hosted on')}</span>
            <span className="info-value">LXC 113 · PVE .103</span>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The sub-pages of Settings, in menu order: /settings/<key>. Password-only
 * things (two-factor login, API tokens) and the calendar feed link aren't
 * offered in the Windows/Linux app, which logs in with a token itself.
 */
export function settingsPages({ admin = false, desktop = IS_DESKTOP } = {}) {
  const app = {
    key: 'app',
    icon: '💻',
    label: desktop ? t('{os} app', { os: DESKTOP_OS }) : t('Windows and Linux app'),
    content: desktop ? <DesktopSettings /> : <AppDownloads />,
  };
  const pages = [
    {
      key: 'account',
      icon: '👤',
      label: t('Account'),
      content: (
        <>
          <AccountSettings />
          {!desktop && <TwoFactorSettings />}
          {!desktop && <ApiTokenSettings />}
        </>
      ),
    },
    { key: 'workspaces', icon: '🗂', label: t('Workspaces'), content: <WorkspaceSettings /> },
    {
      key: 'tasks',
      icon: '🏷',
      label: t('Labels & templates'),
      content: (
        <>
          <LabelSettings />
          <TemplateSettings />
          <ArchiveSettings />
        </>
      ),
    },
    {
      key: 'integrations',
      icon: '🔌',
      label: t('Calendar & Home Assistant'),
      content: (
        <>
          {!desktop && <CalendarFeedSettings />}
          <HomeAssistantSettings />
        </>
      ),
    },
    { key: 'backup', icon: '💾', label: t('Backup & export'), content: <BackupSettings /> },
    {
      key: 'system',
      icon: '⚙',
      label: admin ? t('Updates & users') : t('Updates'),
      content: (
        <>
          <UpdatePanel />
          {admin && <UserManagement />}
        </>
      ),
    },
    { key: 'about', icon: 'ℹ', label: t('About'), content: <About /> },
  ];
  // In the app its own settings (sync, updates, conflicts) come first.
  return desktop ? [app, ...pages] : [...pages.slice(0, 4), app, ...pages.slice(4)];
}

function Settings() {
  const { currentUser } = useAuth();
  const { section } = useParams();
  const pages = settingsPages({ admin: !!currentUser?.is_admin });
  const page = pages.find((p) => p.key === section);
  const menuRef = useRef(null);
  // Phones: the menu is a row of tabs to scroll -- keep the open one in view
  // (sideways only, the page stays where it is).
  useEffect(() => {
    const menu = menuRef.current;
    const active = menu?.querySelector('a.active');
    if (menu && active && menu.scrollWidth > menu.clientWidth) {
      menu.scrollLeft = active.offsetLeft - menu.offsetLeft - (menu.clientWidth - active.offsetWidth) / 2;
    }
  }, [section]);
  if (!page) return <Navigate to={`/settings/${pages[0].key}`} replace />;

  return (
    <div className="container">
      <div className="task-list-header">
        <div className="header-left">
          <h1>{t('Settings')}</h1>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-menu" aria-label={t('Settings')} ref={menuRef}>
          {pages.map((p) => (
            <NavLink key={p.key} to={`/settings/${p.key}`} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="settings-menu-icon" aria-hidden="true">
                {p.icon}
              </span>
              {p.label}
            </NavLink>
          ))}
        </nav>
        <div className="settings-content">{page.content}</div>
      </div>
    </div>
  );
}

export default Settings;
