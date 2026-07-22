import { useState } from 'react';
import type { Employee, LeavePeriod, LeaveType } from '../types';
import { LEAVE_TYPE_LABELS } from '../types';

interface Props {
  employees: Employee[];
  leave: LeavePeriod | null;
  defaultEmployeeId?: number;
  defaultDate?: string;
  onClose: () => void;
  onSave: (data: Partial<LeavePeriod>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  readOnly?: boolean;
}

export default function LeaveModal({
  employees,
  leave,
  defaultEmployeeId,
  defaultDate,
  onClose,
  onSave,
  onDelete,
  readOnly,
}: Props) {
  const [employeeId, setEmployeeId] = useState<number | ''>(leave?.employee_id ?? defaultEmployeeId ?? '');
  const [type, setType] = useState<LeaveType>(leave?.type ?? 'annual');
  const [startDate, setStartDate] = useState(leave?.start_date ?? defaultDate ?? '');
  const [endDate, setEndDate] = useState(leave?.end_date ?? defaultDate ?? '');
  const [notes, setNotes] = useState(leave?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!employeeId) return setError('Choose an employee');
    if (!startDate || !endDate) return setError('Start and end dates are required');
    if (endDate < startDate) return setError('End date must be on or after the start date');

    setSaving(true);
    setError(null);
    try {
      await onSave({
        employee_id: Number(employeeId),
        type,
        start_date: startDate,
        end_date: endDate,
        notes,
      });
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
        <h2>{leave ? (readOnly ? 'View Leave' : 'Edit Leave') : 'New Leave'}</h2>

        <div className="field">
          <label>Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : '')} disabled={readOnly}>
            <option value="" disabled>
              Select employee…
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.role ? ` (${e.role})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as LeaveType)} disabled={readOnly}>
            {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="row">
          <div className="field">
            <label>Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div>
            {!readOnly && leave && onDelete && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (confirm('Remove this leave period?')) {
                    await onDelete(leave.id);
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
