import React, { useState, useEffect } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import UserManagement from './UserManagement';
import UpdatePanel from './UpdatePanel';
import ArchiveSettings from './ArchiveSettings';
import AccountSettings from './AccountSettings';
import BackupSettings from './BackupSettings';
import LabelSettings from './LabelSettings';
import '../styles/Settings.css';
import { t } from '../i18n';

function Settings() {
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

    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setVersion(d.version))
      .catch(() => setVersion(null));
  }, []);

  return (
    <div className="container">
      <div className="task-list-header">
        <div className="header-left">
          <h1>{t('Settings')}</h1>
        </div>
      </div>

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
            <span className="info-label">{t('Stack')}</span>
            <span className="info-value">FastAPI + React + PostgreSQL</span>
          </div>
          <div className="info-row">
            <span className="info-label">{t('Hosted on')}</span>
            <span className="info-value">LXC 113 · PVE .103</span>
          </div>
        </div>
      </div>

      <AccountSettings />

      <ArchiveSettings />

      <LabelSettings />

      <BackupSettings />

      <UpdatePanel />

      {currentUser?.is_admin && <UserManagement />}
    </div>
  );
}

export default Settings;
