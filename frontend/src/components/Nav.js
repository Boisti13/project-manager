import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './NotificationBell';
import '../styles/Nav.css';

function Nav() {
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="app-nav">
      <span className="nav-brand">📋 Project Manager</span>
      <div className="nav-links">
        <NavLink to="/today" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span className="nav-icon" aria-hidden="true">☀</span>
          <span className="nav-label">My day</span>
        </NavLink>
        <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} end>
          <span className="nav-icon" aria-hidden="true">✓</span>
          <span className="nav-label">Tasks</span>
        </NavLink>
        <NavLink to="/projects" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span className="nav-icon" aria-hidden="true">▦</span>
          <span className="nav-label">Projects</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          <span className="nav-icon" aria-hidden="true">⚙</span>
          <span className="nav-label">Settings</span>
        </NavLink>
      </div>
      <div className="nav-user">
        <NotificationBell />
        <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <span className="nav-username">{currentUser?.username}</span>
        <button className="nav-logout" onClick={handleLogout} title="Log out" aria-label="Log out">
          Log Out
        </button>
      </div>
    </nav>
  );
}

export default Nav;
