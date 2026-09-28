import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './NotificationBell';
import SyncStatus from './desktop/SyncStatus';
import { IS_DESKTOP } from '../desktop/platform';
import { engine } from '../desktop';
import '../styles/Nav.css';
import { t, tn } from '../i18n';

function Nav() {
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (IS_DESKTOP) {
      // Windows app: logging out disconnects it and deletes the local copy.
      const pending = engine.status().pending;
      const warning = pending
        ? tn(pending, 'One change hasn’t been sent to the server yet and will be lost. ', '{n} changes haven’t been sent to the server yet and will be lost. ')
        : '';
      if (!window.confirm(warning + t('Disconnect this app and delete its local copy of the data?'))) return;
      await logout({ wipe: true });
    } else {
      logout();
    }
    navigate('/login');
  };

  return (
    <nav className="app-nav">
      <span className="nav-brand">📋 Project Manager</span>
      <div className="nav-links">
        <NavLink to="/today" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span className="nav-icon" aria-hidden="true">☀</span>
          <span className="nav-label">{t('My day')}</span>
        </NavLink>
        <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} end>
          <span className="nav-icon" aria-hidden="true">✓</span>
          <span className="nav-label">{t('Tasks')}</span>
        </NavLink>
        <NavLink to="/projects" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span className="nav-icon" aria-hidden="true">▦</span>
          <span className="nav-label">{t('Projects')}</span>
        </NavLink>
        <NavLink to="/review" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span className="nav-icon" aria-hidden="true">◷</span>
          <span className="nav-label">{t('Review')}</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span className="nav-icon" aria-hidden="true">⚙</span>
          <span className="nav-label">{t('Settings')}</span>
        </NavLink>
      </div>
      <div className="nav-user">
        {IS_DESKTOP && <SyncStatus />}
        <NotificationBell />
        <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <span className="nav-username">{currentUser?.username}</span>
        <button className="nav-logout" onClick={handleLogout} title={t('Log out')} aria-label={t('Log out')}>
          {t('Log Out')}
        </button>
      </div>
    </nav>
  );
}

export default Nav;
