import { useState } from 'react';
import type { Client, Job, JobStatus } from '../types';
import { JOB_STATUS_LABELS } from '../types';

interface Props {
  job: Job | null;
  clients: Client[];
  onClose: () => void;
  onSave: (data: Partial<Job>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  readOnly?: boolean;
}

export default function JobModal({ job, clients, onClose, onSave, onDelete, readOnly }: Props) {
  const [code, setCode] = useState(job?.code ?? '');
  const [name, setName] = useState(job?.name ?? '');
  const [clientId, setClientId] = useState<number | ''>(job?.client_id ?? '');
  const [address, setAddress] = useState(job?.address ?? '');
  const [status, setStatus] = useState<JobStatus>(job?.status ?? 'pipeline');
  const [probability, setProbability] = useState<string>(job?.probability?.toString() ?? '');
  const [notes, setNotes] = useState(job?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Job name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        code,
        name,
        client_id: clientId === '' ? null : Number(clientId),
        address,
        status,
        probability: probability ? Number(probability) : null,
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
        <h2>{job ? (readOnly ? 'View Job' : 'Edit Job') : 'New Job'}</h2>

        <div className="row">
          <div className="field" style={{ flex: '0 0 140px' }}>
            <label>Job code</label>
            <input value={code ?? ''} onChange={(e) => setCode(e.target.value)} placeholder="e.g. J-1024" disabled={readOnly} />
          </div>
          <div className="field">
            <label>Job name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Smith Residence Reroof"
              disabled={readOnly}
            />
          </div>
        </div>
        <div className="field">
          <label>Client</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')} disabled={readOnly}>
            <option value="">— No client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {clients.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              No clients yet — add one from the Clients page first.
            </div>
          )}
        </div>
        <div className="field">
          <label>Address</label>
          <input value={address ?? ''} onChange={(e) => setAddress(e.target.value)} disabled={readOnly} />
        </div>
        <div className="row">
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus)} disabled={readOnly}>
              {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {(status === 'pipeline' || status === 'quoted') && (
            <div className="field">
              <label>Win probability (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                disabled={readOnly}
              />
            </div>
          )}
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={3} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div>
            {!readOnly && job && onDelete && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (confirm(`Delete "${job.name}"? This also removes its phases and assignments.`)) {
                    await onDelete(job.id);
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
