import { useState } from 'react';
import type { Employee } from '../types';
import { SWATCH_COLORS } from '../lib/colors';
import ColorSwatchPicker from './ColorSwatchPicker';

interface Props {
  employee: Employee | null;
  onClose: () => void;
  onSave: (data: Partial<Employee>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  readOnly?: boolean;
}

export default function EmployeeModal({ employee, onClose, onSave, onDelete, readOnly }: Props) {
  const [name, setName] = useState(employee?.name ?? '');
  const [role, setRole] = useState(employee?.role ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [color, setColor] = useState(employee?.color ?? SWATCH_COLORS[10]);
  const [active, setActive] = useState(employee?.active !== 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name, role, email, phone, color, active: active ? 1 : 0 });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{employee ? (readOnly ? 'View Employee' : 'Edit Employee') : 'Add Employee'}</h2>

        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={readOnly} />
        </div>
        <div className="row">
          <div className="field">
            <label>Role</label>
            <input value={role ?? ''} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Foreman" disabled={readOnly} />
          </div>
          <div className="field">
            <label>Colour</label>
            <ColorSwatchPicker value={color} onChange={setColor} disabled={readOnly} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Email</label>
            <input value={email ?? ''} onChange={(e) => setEmail(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} disabled={readOnly} />
          </div>
        </div>
        {employee && (
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row' }}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                style={{ width: 'auto' }}
                disabled={readOnly}
              />
              Active
            </label>
          </div>
        )}

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div>
            {!readOnly && employee && onDelete && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (confirm(`Remove ${employee.name}? This also removes their assignments.`)) {
                    await onDelete(employee.id);
                    onClose();
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>
          <div className="right">
            <button className="btn" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
