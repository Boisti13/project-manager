import React, { createContext, useContext, useState, useEffect } from 'react';
import { t } from '../i18n';
import { IS_DESKTOP } from '../desktop/platform';
import * as desktop from '../desktop';

const AuthContext = createContext(null);

export function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export async function authFetch(url, options = {}) {
  // Windows app: the local copy answers first, the server for the rest.
  if (IS_DESKTOP) return desktop.desktopFetch(url, options);
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error(t('Session expired'));
  }
  return response;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_DESKTOP) {
      // Start with the local copy (works offline); sync in the background.
      desktop.whenReady().then(() => {
        const me = desktop.store.getMeta('me');
        if (desktop.isConnected() && me) {
          setCurrentUser(me);
          desktop.engine.start();
        }
        setLoading(false);
      });
      // Keep the name, language etc. current after syncs.
      return desktop.engine.subscribe(() => {
        const me = desktop.store.getMeta('me');
        if (desktop.isConnected() && me) setCurrentUser((cur) => (cur && JSON.stringify(cur) === JSON.stringify(me) ? cur : me));
      });
    }
    const init = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setCurrentUser(await res.json());
        } else {
          setToken(null);
        }
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const login = async (username, password) => {
    const body = new URLSearchParams();
    body.append('username', username);
    body.append('password', password);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || t('Login failed'));
    }
    const data = await res.json();
    setToken(data.access_token);
    const meRes = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const me = await meRes.json();
    setCurrentUser(me);
    return me;
  };

  const register = async (username, email, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // Validation errors come as a list: [{loc: [..., 'password'], msg}]
      const detail = Array.isArray(data.detail)
        ? data.detail.map((d) => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join('; ')
        : data.detail;
      throw new Error(detail || t('Registration failed'));
    }
    await login(username, password);
  };

  const logout = async (options) => {
    if (IS_DESKTOP) await desktop.disconnect(options);
    setToken(null);
    setCurrentUser(null);
  };

  // Windows app: connect to a server (see desktop/index.js).
  const connect = async (server, username, password) => {
    const me = await desktop.connect(server, username, password);
    setCurrentUser(me);
    return me;
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, loading, login, register, logout, connect, updateCurrentUser: setCurrentUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
