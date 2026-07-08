import { useState } from 'react';

interface Props {
  onClose: () => void;
  onSave: (data: { username: string; password: string; is_admin: boolean }) => Promise<void>;
}

export default function UserModal({ onClose, onSave }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!username.trim()) return setError('Username is required');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setSaving(true);
    setError(null);
    try {
      await onSave({ username: username.trim(), password, is_admin: isAdmin });
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
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Admin (can manage users)
        </label>

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
