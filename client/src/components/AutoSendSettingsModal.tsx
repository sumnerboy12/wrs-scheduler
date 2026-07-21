import { useState } from 'react';
import type { AutoSendConfig } from '../types';

interface Props {
  config: AutoSendConfig;
  description: string;
  showIncludeWeekends?: boolean;
  onClose: () => void;
  onSave: (data: AutoSendConfig) => Promise<void>;
}

const DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

export default function AutoSendSettingsModal({ config, description, showIncludeWeekends = true, onClose, onSave }: Props) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [dayOfWeek, setDayOfWeek] = useState(config.dayOfWeek);
  const [time, setTime] = useState(config.time);
  const [includeWeekends, setIncludeWeekends] = useState(config.includeWeekends);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ enabled, dayOfWeek, time, includeWeekends });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2>Automatic sending</h2>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, fontSize: 14 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Automatically send next week's summaries every week
        </label>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, opacity: enabled ? 1 : 0.5 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Day</label>
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} disabled={!enabled}>
              {DAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!enabled} />
          </div>
        </div>

        {showIncludeWeekends && (
          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginBottom: 16,
              fontSize: 13,
              opacity: enabled ? 1 : 0.5,
            }}
          >
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={includeWeekends}
              onChange={(e) => setIncludeWeekends(e.target.checked)}
              disabled={!enabled}
            />
            Include weekends in the bookings table
          </label>
        )}

        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: -8 }}>{description}</p>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div />
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
