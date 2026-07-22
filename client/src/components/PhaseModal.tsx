import { useState } from 'react';
import type { Phase } from '../types';

interface Props {
  phase: Phase | null;
  defaultSequence: number;
  onClose: () => void;
  onSave: (data: Partial<Phase>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  readOnly?: boolean;
}

export default function PhaseModal({ phase, defaultSequence, onClose, onSave, onDelete, readOnly }: Props) {
  const [name, setName] = useState(phase?.name ?? '');
  const [sequence, setSequence] = useState(phase?.sequence ?? defaultSequence);
  const [startDate, setStartDate] = useState(phase?.start_date ?? '');
  const [endDate, setEndDate] = useState(phase?.end_date ?? '');
  const [estimatedStaff, setEstimatedStaff] = useState(phase?.estimated_staff != null ? String(phase.estimated_staff) : '');
  const [notes, setNotes] = useState(phase?.notes ?? '');
  const [complete, setComplete] = useState(phase?.complete === 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) return setError('Phase name is required');
    if (!startDate || !endDate) return setError('Start and end dates are required');
    if (endDate < startDate) return setError('End date must be on or after the start date');

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name,
        sequence,
        start_date: startDate,
        end_date: endDate,
        estimated_staff: estimatedStaff.trim() ? Number(estimatedStaff) : null,
        notes,
        complete: complete ? 1 : 0,
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
        <h2>{phase ? (readOnly ? 'View Phase' : 'Edit Phase') : 'Add Phase'}</h2>

        <div className="field">
          <label>Phase name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Tear-off & Dry-in"
            disabled={readOnly}
          />
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
        <div className="row">
          <div className="field">
            <label>Order (sequence)</label>
            <input type="number" value={sequence} onChange={(e) => setSequence(Number(e.target.value))} disabled={readOnly} />
          </div>
          <div className="field">
            <label>Estimated staff (optional)</label>
            <input
              type="number"
              min={0}
              placeholder="e.g. 3"
              value={estimatedStaff}
              onChange={(e) => setEstimatedStaff(e.target.value)}
              disabled={readOnly}
            />
          </div>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        </div>
        {phase && (
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row' }}>
              <input
                type="checkbox"
                checked={complete}
                onChange={(e) => setComplete(e.target.checked)}
                style={{ width: 'auto' }}
                disabled={readOnly}
              />
              Complete — hide from the Schedule
            </label>
          </div>
        )}

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div>
            {!readOnly && phase && onDelete && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (confirm(`Delete phase "${phase.name}"? This also removes its assignments.`)) {
                    await onDelete(phase.id);
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
