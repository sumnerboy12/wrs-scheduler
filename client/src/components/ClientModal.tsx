import { useState } from 'react';
import type { Client } from '../types';
import { SWATCH_COLORS } from '../lib/colors';
import ColorSwatchPicker from './ColorSwatchPicker';

interface Props {
  client: Client | null;
  onClose: () => void;
  onSave: (data: Partial<Client>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export default function ClientModal({ client, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState(client?.name ?? '');
  const [color, setColor] = useState(client?.color ?? SWATCH_COLORS[5]);
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Client name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name, color, notes });
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
        <h2>{client ? 'Edit Client' : 'New Client'}</h2>

        <div className="row">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Colour</label>
            <ColorSwatchPicker value={color} onChange={setColor} />
          </div>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={3} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div>
            {client && onDelete && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (confirm(`Delete "${client.name}"? Jobs linked to this client are kept, just unlinked.`)) {
                    await onDelete(client.id);
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
