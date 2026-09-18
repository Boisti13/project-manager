import React, { useState, useEffect } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import UserManagement from './UserManagement';
import '../styles/Settings.css';

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
          <h1>Settings</h1>
        </div>
      </div>

      <div className="settings-section">
        <h2>Overview</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{loading ? '—' : stats.tasks}</span>
            <span className="stat-label">Tasks</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{loading ? '—' : stats.projects}</span>
            <span className="stat-label">Projects</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{loading ? '—' : stats.users}</span>
            <span className="stat-label">Users</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2>About</h2>
        <div className="settings-info">
          <div className="info-row">
            <span className="info-label">Logged in as</span>
            <span className="info-value">{currentUser?.username} ({currentUser?.email})</span>
          </div>
          <div className="info-row">
            <span className="info-label">Application</span>
            <span className="info-value">Project Manager{version ? ` v${version}` : ''}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Stack</span>
            <span className="info-value">FastAPI + React + PostgreSQL</span>
          </div>
          <div className="info-row">
            <span className="info-label">Hosted on</span>
            <span className="info-value">LXC 113 · PVE .103</span>
          </div>
        </div>
      </div>

      {currentUser?.is_admin && <UserManagement />}
    </div>
  );
}

export default Settings;
