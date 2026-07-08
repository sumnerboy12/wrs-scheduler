import { useState } from 'react';
import { api } from '../api/client';

interface Props {
  mandatory?: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function ChangePasswordModal({ mandatory, onClose, onChanged }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (newPassword.length < 8) return setError('New password must be at least 8 characters');
    if (newPassword !== confirmPassword) return setError('Passwords do not match');
    setSaving(true);
    setError(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={mandatory ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{mandatory ? 'Set a new password' : 'Change password'}</h2>
        {mandatory && (
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: -8 }}>
            This account has a temporary password. Choose a new one to continue.
          </p>
        )}
        <div className="field">
          <label>{mandatory ? 'Temporary password' : 'Current password'}</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>New password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div />
          <div className="right">
            {!mandatory && (
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
