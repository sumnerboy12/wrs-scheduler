import { useEffect, useRef, useState } from 'react';

// Controls which categories of bar show on the Schedule's timeline —
// separate from StatusFilterDropdown, which controls which *jobs* (by
// status) are included in the first place.
export type ScheduleItemType = 'jobs' | 'leave' | 'nonBillable';

export const ALL_ITEM_TYPES: ScheduleItemType[] = ['jobs', 'leave', 'nonBillable'];

const ITEM_TYPE_LABELS: Record<ScheduleItemType, string> = {
  jobs: 'Jobs',
  leave: 'Leave',
  nonBillable: 'Non-billable',
};

interface Props {
  value: ScheduleItemType[];
  onChange: (next: ScheduleItemType[]) => void;
}

export default function ItemTypeFilterDropdown({ value, onChange }: Props) {
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

  const toggle = (type: ScheduleItemType) => {
    onChange(value.includes(type) ? value.filter((t) => t !== type) : [...value, type]);
  };

  const selectedLabels = ALL_ITEM_TYPES.filter((t) => value.includes(t)).map((t) => ITEM_TYPE_LABELS[t]);

  const summary =
    value.length === ALL_ITEM_TYPES.length
      ? 'All types'
      : value.length === 0
        ? 'No types'
        : selectedLabels.join(', ');

  const tooltip = value.length === 0 ? 'No item types selected' : selectedLabels.join(', ');

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 160 }}>
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
            minWidth: 160,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => onChange(ALL_ITEM_TYPES)}>
              All
            </button>
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => onChange([])}>
              None
            </button>
          </div>
          {ALL_ITEM_TYPES.map((type) => (
            <label
              key={type}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}
            >
              <input type="checkbox" style={{ width: 'auto' }} checked={value.includes(type)} onChange={() => toggle(type)} />
              {ITEM_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
