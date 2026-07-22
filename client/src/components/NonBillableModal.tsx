import { useState } from 'react';
import type { Employee, NonBillableCategory, NonBillablePeriod } from '../types';
import { NON_BILLABLE_CATEGORY_LABELS } from '../types';

interface Props {
  employees: Employee[];
  nonBillable: NonBillablePeriod | null;
  defaultEmployeeId?: number;
  defaultDate?: string;
  onClose: () => void;
  onSave: (data: Partial<NonBillablePeriod>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  readOnly?: boolean;
}

export default function NonBillableModal({
  employees,
  nonBillable,
  defaultEmployeeId,
  defaultDate,
  onClose,
  onSave,
  onDelete,
  readOnly,
}: Props) {
  const [employeeIds, setEmployeeIds] = useState<number[]>(
    nonBillable ? [nonBillable.employee_id] : defaultEmployeeId ? [defaultEmployeeId] : [],
  );
  const [category, setCategory] = useState<NonBillableCategory>(nonBillable?.category ?? 'admin');
  const [startDate, setStartDate] = useState(nonBillable?.start_date ?? defaultDate ?? '');
  const [endDate, setEndDate] = useState(nonBillable?.end_date ?? defaultDate ?? '');
  const [allocationPct, setAllocationPct] = useState(nonBillable?.allocation_pct ?? 100);
  const [notes, setNotes] = useState(nonBillable?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (employeeIds.length === 0) return setError(nonBillable ? 'Choose an employee' : 'Choose at least one employee');
    if (!startDate || !endDate) return setError('Start and end dates are required');
    if (endDate < startDate) return setError('End date must be on or after the start date');

    setSaving(true);
    setError(null);
    try {
      // Editing always targets the one record being edited; creating fires
      // one create per selected employee so a whole crew can be marked
      // non-billable for the same dates in a single save.
      for (const employeeId of employeeIds) {
        await onSave({
          employee_id: employeeId,
          category,
          start_date: startDate,
          end_date: endDate,
          allocation_pct: Number(allocationPct),
          notes,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleEmployee = (id: number, checked: boolean) => {
    setEmployeeIds((prev) => (checked ? [...prev, id] : prev.filter((existing) => existing !== id)));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{nonBillable ? (readOnly ? 'View Non-billable Time' : 'Edit Non-billable Time') : 'New Non-billable Time'}</h2>

        {nonBillable ? (
          <div className="field">
            <label>Employee</label>
            <select
              value={employeeIds[0] ?? ''}
              onChange={(e) => setEmployeeIds([Number(e.target.value)])}
              disabled={readOnly}
            >
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
        ) : (
          <div className="field">
            <label>
              Employees
              {employeeIds.length > 0 ? ` (${employeeIds.length} selected)` : ''}
            </label>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 6,
                maxHeight: 170,
                overflowY: 'auto',
                padding: '4px 8px',
              }}
            >
              {employees.map((e) => (
                <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={employeeIds.includes(e.id)}
                    onChange={(ev) => toggleEmployee(e.id, ev.target.checked)}
                    disabled={readOnly}
                  />
                  {e.name}
                  {e.role ? ` (${e.role})` : ''}
                </label>
              ))}
              {employees.length === 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '4px 0' }}>No employees available.</div>
              )}
            </div>
          </div>
        )}

        <div className="field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as NonBillableCategory)} disabled={readOnly}>
            {Object.entries(NON_BILLABLE_CATEGORY_LABELS).map(([value, label]) => (
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
          <label>Allocation (%)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={allocationPct}
            onChange={(e) => setAllocationPct(Number(e.target.value))}
            disabled={readOnly}
          />
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div>
            {!readOnly && nonBillable && onDelete && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (confirm('Remove this non-billable time?')) {
                    await onDelete(nonBillable.id);
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
