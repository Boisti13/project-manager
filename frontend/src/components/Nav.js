import React from 'react';
import { NavLink } from 'react-router-dom';
import '../styles/Nav.css';

function Nav() {
  return (
    <nav className="app-nav">
      <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} end>
        Tasks
      </NavLink>
      <NavLink to="/projects" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
        Projects
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
        Settings
      </NavLink>
    </nav>
  );
}

export default Nav;
