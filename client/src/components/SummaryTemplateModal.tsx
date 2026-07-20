import { useState } from 'react';
import type { SummaryTemplate } from '../types';

interface Props {
  template: SummaryTemplate;
  onClose: () => void;
  onSave: (data: SummaryTemplate) => Promise<void>;
}

const PLACEHOLDERS = [
  { token: '{{first_name}}', description: "employee's first name" },
  { token: '{{full_name}}', description: "employee's full name" },
  { token: '{{start_date}}', description: 'range start, e.g. Mon 20 Jul' },
  { token: '{{end_date}}', description: 'range end, e.g. Sun 26 Jul' },
  { token: '{{bookings}}', description: 'the rendered list of bookings (or "nothing scheduled")' },
];

export default function SummaryTemplateModal({ template, onClose, onSave }: Props) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and message are both required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ subject, body });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2>Edit summary email template</h2>

        <div className="field">
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="field">
          <label>Message</label>
          <textarea rows={10} style={{ fontFamily: 'monospace', fontSize: 13 }} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        <div className="card" style={{ padding: 12, marginBottom: 16, fontSize: 13 }}>
          <div style={{ color: 'var(--text-dim)', marginBottom: 6 }}>Placeholders you can use:</div>
          {PLACEHOLDERS.map((p) => (
            <div key={p.token} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
              <code style={{ background: 'var(--panel-alt)', padding: '1px 5px', borderRadius: 4 }}>{p.token}</code>
              <span style={{ color: 'var(--text-dim)' }}>{p.description}</span>
            </div>
          ))}
        </div>

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
