import { useState } from 'react';

interface Props {
  username: string;
  onClose: () => void;
  onSave: (password: string) => Promise<void>;
}

export default function ResetPasswordModal({ username, onClose, onSave }: Props) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setSaving(true);
    setError(null);
    try {
      await onSave(password);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Reset password for {username}</h2>
        <div className="field">
          <label>New temporary password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>They'll be asked to set their own password on next login.</div>
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
