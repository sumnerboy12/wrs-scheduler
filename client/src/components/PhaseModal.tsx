import { useState } from 'react';
import type { Phase } from '../types';

interface Props {
  phase: Phase | null;
  defaultSequence: number;
  onClose: () => void;
  onSave: (data: Partial<Phase>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export default function PhaseModal({ phase, defaultSequence, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState(phase?.name ?? '');
  const [sequence, setSequence] = useState(phase?.sequence ?? defaultSequence);
  const [startDate, setStartDate] = useState(phase?.start_date ?? '');
  const [endDate, setEndDate] = useState(phase?.end_date ?? '');
  const [notes, setNotes] = useState(phase?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) return setError('Phase name is required');
    if (!startDate || !endDate) return setError('Start and end dates are required');
    if (endDate < startDate) return setError('End date must be on or after the start date');

    setSaving(true);
    setError(null);
    try {
      await onSave({ name, sequence, start_date: startDate, end_date: endDate, notes });
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
        <h2>{phase ? 'Edit Phase' : 'Add Phase'}</h2>

        <div className="field">
          <label>Phase name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Tear-off & Dry-in" />
        </div>
        <div className="row">
          <div className="field">
            <label>Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label>End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Order (sequence)</label>
          <input type="number" value={sequence} onChange={(e) => setSequence(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div>
            {phase && onDelete && (
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
