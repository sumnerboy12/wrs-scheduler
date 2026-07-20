import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import type { ManagedUser, UserRole } from '../types';
import { useAuth } from '../auth/AuthContext';
import UserModal from '../components/UserModal';
import ResetPasswordModal from '../components/ResetPasswordModal';

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getUsers().then((data) => {
      setUsers(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  const toggleActive = async (u: ManagedUser) => {
    setError(null);
    try {
      await api.updateUser(u.id, { active: !u.active });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user');
    }
  };

  const changeRole = async (u: ManagedUser, role: UserRole) => {
    setError(null);
    try {
      await api.updateUser(u.id, { role });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user');
    }
  };

  const remove = async (u: ManagedUser) => {
    if (!confirm(`Remove login access for "${u.username}"?`)) return;
    setError(null);
    try {
      await api.deleteUser(u.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove user');
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Users</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          + Add User
        </button>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Password</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                  <td>{u.username}</td>
                  <td>
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value as UserRole)}
                      disabled={u.id === user.id}
                      style={{ fontSize: 13 }}
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="readonly">Read only</option>
                    </select>
                  </td>
                  <td>{u.active ? 'Active' : 'Inactive'}</td>
                  <td>{u.must_change_password ? 'Must change on next login' : 'Set'}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => setResetting(u)}>
                      Reset password
                    </button>
                    <button className="btn" onClick={() => toggleActive(u)} disabled={u.id === user.id}>
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-danger" onClick={() => remove(u)} disabled={u.id === user.id}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <UserModal
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await api.createUser(data);
            load();
          }}
        />
      )}
      {resetting && (
        <ResetPasswordModal
          username={resetting.username}
          onClose={() => setResetting(null)}
          onSave={async (password) => {
            await api.resetUserPassword(resetting.id, password);
            load();
          }}
        />
      )}
    </div>
  );
}
