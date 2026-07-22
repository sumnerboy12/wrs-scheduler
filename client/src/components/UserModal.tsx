import { useState } from 'react';
import type { ManagedUser, UserRole } from '../types';

interface Props {
  user: ManagedUser | null;
  currentUserId: number;
  onClose: () => void;
  onSave: (
    data: { username: string; password: string; role: UserRole; email: string | null } | { role: UserRole; active: boolean; email: string | null }
  ) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export default function UserModal({ user, currentUserId, onClose, onSave, onDelete }: Props) {
  const isSelf = user?.id === currentUserId;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'editor');
  const [active, setActive] = useState(user?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!user) {
      if (!username.trim()) return setError('Username is required');
      if (password.length < 8) return setError('Password must be at least 8 characters');
    }
    setSaving(true);
    setError(null);
    try {
      const emailValue = email.trim() || null;
      await onSave(user ? { role, active, email: emailValue } : { username: username.trim(), password, role, email: emailValue });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !onDelete) return;
    if (!confirm(`Remove login access for "${user.username}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(user.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{user ? 'Edit User' : 'New User'}</h2>

        {user ? (
          <div className="field">
            <label>Username</label>
            <div style={{ padding: '6px 0' }}>{user.username}</div>
          </div>
        ) : (
          <>
            <div className="field">
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Temporary password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>They'll be asked to set their own password on first login.</div>
            </div>
          </>
        )}

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Only needed to enable "Sign in with SSO" for this account — must match their identity provider email.
          </div>
        </div>

        <div className="field" style={{ marginBottom: user ? 8 : 12 }}>
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isSelf}>
            <option value="admin">Admin — can manage users</option>
            <option value="editor">Editor — can edit the schedule and jobs</option>
            <option value="readonly">Read only — can view only</option>
          </select>
          {isSelf && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>You can't change your own role.</div>}
        </div>

        {user && (
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={isSelf}
            />
            Active
          </label>
        )}

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div>
            {user && onDelete && !isSelf && (
              <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                Delete
              </button>
            )}
          </div>
          <div className="right">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
