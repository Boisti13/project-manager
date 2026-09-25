import React, { useState, useEffect } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import '../styles/UserManagement.css';

function UserManagement() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load once when the page opens.
  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseApiError = async (response) => {
    try {
      const data = await response.json();
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

  if (loading) return <p>Loading users...</p>;

  return (
    <div className="settings-section">
      <h2>User Management</h2>
      {error && <div className="error-message">{error}</div>}
      <div className="user-table">
        {users.map((user) => {
          const isSelf = user.id === currentUser.id;
          return (
            <div className="user-row" key={user.id}>
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
          );
        })}
      </div>
    </div>
  );
}

export default UserManagement;
