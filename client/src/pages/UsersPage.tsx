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
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);

  const load = () => {
    setLoading(true);
    api.getUsers().then((data) => {
      setUsers(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Users</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          + Add User
        </button>
      </div>

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
                  <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                  <td>{u.active ? 'Active' : 'Inactive'}</td>
                  <td>{u.must_change_password ? 'Must change on next login' : 'Set'}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => setResetting(u)}>
                      Reset password
                    </button>
                    <button className="btn" onClick={() => setEditing(u)}>
                      Edit
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
          user={null}
          currentUserId={user.id}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await api.createUser(data as { username: string; password: string; role: UserRole });
            load();
          }}
        />
      )}
      {editing && (
        <UserModal
          user={editing}
          currentUserId={user.id}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await api.updateUser(editing.id, data as Partial<{ role: UserRole; active: boolean }>);
            load();
          }}
          onDelete={async (id) => {
            await api.deleteUser(id);
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
