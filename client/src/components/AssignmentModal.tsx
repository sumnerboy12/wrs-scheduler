import { useMemo, useState } from 'react';
import type { Assignment, Employee, Job, Phase } from '../types';
import { formatShortDate } from '../lib/dates';

interface Props {
  employees: Employee[];
  jobs: Job[];
  phases: Phase[];
  assignment: Assignment | null;
  defaultEmployeeId?: number;
  defaultJobId?: number;
  defaultPhaseId?: number;
  defaultDate?: string;
  onClose: () => void;
  onSave: (data: Partial<Assignment>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export default function AssignmentModal({
  employees,
  jobs,
  phases,
  assignment,
  defaultEmployeeId,
  defaultJobId,
  defaultPhaseId,
  defaultDate,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const editingPhase = assignment ? phases.find((p) => p.id === assignment.phase_id) : null;

  const [employeeId, setEmployeeId] = useState<number | ''>(assignment?.employee_id ?? defaultEmployeeId ?? '');
  const [jobId, setJobId] = useState<number | ''>(editingPhase?.job_id ?? defaultJobId ?? '');
  const [phaseId, setPhaseId] = useState<number | ''>(assignment?.phase_id ?? defaultPhaseId ?? '');
  const [startDate, setStartDate] = useState(assignment?.start_date ?? defaultDate ?? '');
  const [endDate, setEndDate] = useState(assignment?.end_date ?? defaultDate ?? '');
  const [allocationPct, setAllocationPct] = useState(assignment?.allocation_pct ?? 100);
  const [notes, setNotes] = useState(assignment?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeJobs = useMemo(() => jobs.filter((j) => j.status !== 'lost'), [jobs]);
  const phasesForJob = useMemo(() => phases.filter((p) => p.job_id === jobId), [phases, jobId]);

  const handleJobChange = (id: number) => {
    setJobId(id);
    const first = phases.find((p) => p.job_id === id);
    setPhaseId(first?.id ?? '');
    if (first) {
      setStartDate((s) => s || first.start_date);
      setEndDate((e) => e || first.end_date);
    }
  };

  const handleSave = async () => {
    if (!employeeId) return setError('Choose an employee');
    if (!phaseId) return setError('Choose a job phase');
    if (!startDate || !endDate) return setError('Start and end dates are required');
    if (endDate < startDate) return setError('End date must be on or after the start date');

    setSaving(true);
    setError(null);
    try {
      await onSave({
        employee_id: Number(employeeId),
        phase_id: Number(phaseId),
        start_date: startDate,
        end_date: endDate,
        allocation_pct: Number(allocationPct),
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
        <h2>{assignment ? 'Edit Assignment' : 'New Assignment'}</h2>

        <div className="field">
          <label>Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(Number(e.target.value))}>
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
          <label>Job</label>
          <select value={jobId} onChange={(e) => handleJobChange(Number(e.target.value))}>
            <option value="" disabled>
              Select job…
            </option>
            {activeJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code ? `${j.code} — ${j.name}` : j.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Phase</label>
          <select value={phaseId} onChange={(e) => setPhaseId(Number(e.target.value))} disabled={!jobId}>
            <option value="" disabled>
              {jobId ? 'Select phase…' : 'Select a job first'}
            </option>
            {phasesForJob.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({formatShortDate(p.start_date)} – {formatShortDate(p.end_date)})
              </option>
            ))}
          </select>
          {jobId && phasesForJob.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              This job has no phases yet — add one from the Jobs page first.
            </div>
          )}
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
          <label>Allocation (%)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={allocationPct}
            onChange={(e) => setAllocationPct(Number(e.target.value))}
          />
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div>
            {assignment && onDelete && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (confirm('Remove this assignment?')) {
                    await onDelete(assignment.id);
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
