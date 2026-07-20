import type { SummaryPreview } from '../types';

interface Props {
  employeeName: string;
  preview: SummaryPreview | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export default function SummaryPreviewModal({ employeeName, preview, loading, error, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 600 }} onClick={(e) => e.stopPropagation()}>
        <h2>Preview: {employeeName}</h2>

        {loading && <div style={{ padding: 12, color: 'var(--text-dim)' }}>Loading…</div>}
        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        {preview && (
          <>
            <div className="field">
              <label>Subject</label>
              <div className="card" style={{ padding: '8px 12px', fontSize: 14 }}>
                {preview.subject}
              </div>
            </div>
            <div className="field">
              <label>Message</label>
              {/* Monospace + no wrapping (scroll instead) — the body is a
                  plain-text email, and its bookings table is aligned with
                  padded spaces, which only lines up in a fixed-width font. */}
              <div
                className="card"
                style={{
                  padding: '12px 14px',
                  fontSize: 13,
                  fontFamily: 'ui-monospace, Consolas, "SFMono-Regular", monospace',
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                }}
              >
                {preview.text}
              </div>
            </div>
          </>
        )}

        <div className="modal-actions">
          <div />
          <div className="right">
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
