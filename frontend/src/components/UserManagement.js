import React, { useState, useEffect } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import '../styles/UserManagement.css';

const EMPTY_NEW_USER = { username: '', email: '', password: '', is_admin: false };

function UserManagement() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [registrationOpen, setRegistrationOpen] = useState(null);
  const [newUser, setNewUser] = useState(null); // form values while "Add user" is open
  const [passwordFor, setPasswordFor] = useState(null); // { id, username, password }

  // Load once when the page opens.
  useEffect(() => {
    loadUsers();
    authFetch('/api/settings/')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRegistrationOpen(d.allow_registration))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseApiError = async (response) => {
    try {
      const data = await response.json();
      if (Array.isArray(data.detail)) {
        return data.detail.map((d) => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join('; ');
      }
      return data.detail || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/users/admin/all');
      if (!res.ok) throw new Error(await parseApiError(res));
      setUsers(await res.json());
      setError(null);
    } catch (err) {
      setError('Failed to load users: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (userId, patch) => {
    try {
      const res = await authFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const updated = await res.json();
      setUsers(users.map((u) => (u.id === userId ? updated : u)));
      setError(null);
    } catch (err) {
      setError('Failed to update user: ' + err.message);
    }
  };

  const toggleAdmin = (user) => updateUser(user.id, { is_admin: !user.is_admin });
  const toggleActive = (user) => updateUser(user.id, { is_active: !user.is_active });

  const toggleRegistration = async () => {
    try {
      const res = await authFetch('/api/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_registration: !registrationOpen }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      setRegistrationOpen((await res.json()).allow_registration);
      setError(null);
    } catch (err) {
      setError('Failed to change registration: ' + err.message);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/users/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const created = await res.json();
      setUsers([...users, created]);
      setNewUser(null);
      setError(null);
      setNotice(`Created ${created.username}. Share the password with them; they can change it under Settings → Your account.`);
    } catch (err) {
      setError('Failed to create user: ' + err.message);
    }
  };

  const setPassword = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch(`/api/users/${passwordFor.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordFor.password }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      setNotice(`New password set for ${passwordFor.username}.`);
      setPasswordFor(null);
      setError(null);
    } catch (err) {
      setError('Failed to set password: ' + err.message);
    }
  };

  if (loading) return <p>Loading users...</p>;

  return (
    <div className="settings-section">
      <h2>User Management</h2>
      {error && <div className="error-message">{error}</div>}
      {notice && <p className="settings-ok user-notice">{notice}</p>}

      <div className="user-registration">
        <label className="user-toggle">
          <input
            type="checkbox"
            checked={!!registrationOpen}
            onChange={toggleRegistration}
            disabled={registrationOpen === null}
          />
          <span>
            <strong>Allow new registrations</strong>
            <small>
              {registrationOpen
                ? 'Anyone who can reach this server can create an account on the login page.'
                : 'Closed — only admins can add accounts (below).'}
            </small>
          </span>
        </label>
        {!newUser && (
          <button
            className="btn btn-primary btn-small"
            onClick={() => {
              setNewUser(EMPTY_NEW_USER);
              setNotice(null);
            }}
          >
            + Add user
          </button>
        )}
      </div>

      {newUser && (
        <form className="user-form" onSubmit={createUser}>
          <input
            placeholder="Username"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            required
            autoFocus
            autoComplete="off"
          />
          <input
            type="email"
            placeholder="Email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            required
            autoComplete="off"
          />
          <input
            type="password"
            placeholder="Initial password (min. 8)"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <label className="user-form-check">
            <input
              type="checkbox"
              checked={newUser.is_admin}
              onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
            />
            Admin
          </label>
          <div className="user-form-buttons">
            <button type="submit" className="btn btn-primary btn-small">
              Create
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setNewUser(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="user-table">
        {users.map((user) => {
          const isSelf = user.id === currentUser.id;
          return (
            <div className="user-row-wrap" key={user.id}>
              <div className="user-row">
                <div className="user-info">
                  <span className="user-name">
                    {user.username}
                    {isSelf && <span className="user-you"> (you)</span>}
                  </span>
                  <span className="user-email">{user.email}</span>
                </div>
                <div className="user-badges">
                  <span className={`user-badge ${user.is_admin ? 'badge-admin' : 'badge-user'}`}>
                    {user.is_admin ? 'Admin' : 'User'}
                  </span>
                  <span className={`user-badge ${user.is_active ? 'badge-active' : 'badge-inactive'}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="user-actions">
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => {
                      setPasswordFor({ id: user.id, username: user.username, password: '' });
                      setNotice(null);
                    }}
                    title={isSelf ? 'Use Settings → Your account to change your own password' : 'Set a new password'}
                    disabled={isSelf}
                  >
                    Set password
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => toggleAdmin(user)}
                    disabled={isSelf && user.is_admin}
                    title={isSelf && user.is_admin ? "You can't remove your own admin rights" : ''}
                  >
                    {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => toggleActive(user)}
                    disabled={isSelf}
                    title={isSelf ? "You can't deactivate your own account" : ''}
                  >
                    {user.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
              {passwordFor?.id === user.id && (
                <form className="user-form user-password-form" onSubmit={setPassword}>
                  <input
                    type="password"
                    placeholder={`New password for ${user.username} (min. 8)`}
                    value={passwordFor.password}
                    onChange={(e) => setPasswordFor({ ...passwordFor, password: e.target.value })}
                    required
                    minLength={8}
                    autoFocus
                    autoComplete="new-password"
                  />
                  <div className="user-form-buttons">
                    <button type="submit" className="btn btn-primary btn-small">
                      Set password
                    </button>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setPasswordFor(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default UserManagement;
