import { useState } from 'react';
import type { UserRole } from '../types';

interface Props {
  onClose: () => void;
  onSave: (data: { username: string; password: string; role: UserRole }) => Promise<void>;
}

export default function UserModal({ onClose, onSave }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('editor');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!username.trim()) return setError('Username is required');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setSaving(true);
    setError(null);
    try {
      await onSave({ username: username.trim(), password, role });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New User</h2>
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Temporary password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>They'll be asked to set their own password on first login.</div>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="admin">Admin — can manage users</option>
            <option value="editor">Editor — can edit the schedule and jobs</option>
            <option value="readonly">Read only — can view only</option>
          </select>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div />
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
