import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { JobStatus } from '../types';
import { JOB_STATUS_LABELS } from '../types';

export const ALL_STATUSES = Object.keys(JOB_STATUS_LABELS) as JobStatus[];
export const ACTIVE_STATUSES = ALL_STATUSES.filter((s) => s !== 'complete' && s !== 'lost' && s !== 'on_hold');

interface Props {
  value: JobStatus[];
  onChange: (next: JobStatus[]) => void;
  style?: CSSProperties;
}

export default function StatusFilterDropdown({ value, onChange, style }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggle = (status: JobStatus) => {
    onChange(value.includes(status) ? value.filter((s) => s !== status) : [...value, status]);
  };

  const selectedLabels = ALL_STATUSES.filter((s) => value.includes(s)).map((s) => JOB_STATUS_LABELS[s]);
  const isSameSet = (a: JobStatus[], b: JobStatus[]) => a.length === b.length && a.every((s) => b.includes(s));

  const summary =
    value.length === ALL_STATUSES.length
      ? 'All jobs'
      : isSameSet(value, ACTIVE_STATUSES)
        ? 'Active jobs'
        : value.length === 0
          ? 'No jobs'
          : value.length === 1
            ? JOB_STATUS_LABELS[value[0]]
            : `${value.length} statuses`;

  const tooltip = value.length === 0 ? 'No statuses selected' : selectedLabels.join(', ');

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 160, ...style }}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((o) => !o)}
        title={tooltip}
        style={{ width: '100%', textAlign: 'left' }}
      >
        {summary}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 20,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 8,
            minWidth: 180,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => onChange(ALL_STATUSES)}>
              All jobs
            </button>
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => onChange(ACTIVE_STATUSES)}>
              Active jobs
            </button>
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => onChange([])}>
              None
            </button>
          </div>
          {ALL_STATUSES.map((status) => (
            <label
              key={status}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}
            >
              <input type="checkbox" style={{ width: 'auto' }} checked={value.includes(status)} onChange={() => toggle(status)} />
              {JOB_STATUS_LABELS[status]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
