import type { SendSummariesResult, SummaryPreview } from '../types';

interface Props {
  employeeName: string;
  preview: SummaryPreview | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSend?: () => void;
  sending?: boolean;
  sendResult?: SendSummariesResult | null;
  canSend?: boolean;
}

export default function SummaryPreviewModal({
  employeeName,
  preview,
  loading,
  error,
  onClose,
  onSend,
  sending,
  sendResult,
  canSend,
}: Props) {
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
              {/* Rendered in a sandboxed iframe (via srcDoc) rather than
                  dangerouslySetInnerHTML — this is the actual HTML that
                  goes out, so an iframe keeps its styles from bleeding
                  into the surrounding app and shows exactly what most
                  recipients (Outlook etc.) will see, table alignment
                  included. */}
              <iframe
                title="Email preview"
                srcDoc={preview.html}
                sandbox=""
                className="card"
                style={{ width: '100%', height: 340, border: 'none', background: '#fff' }}
              />
            </div>
          </>
        )}

        <div className="modal-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {sendResult && (
              <span
                style={{
                  fontSize: 13,
                  color:
                    sendResult.status === 'sent'
                      ? 'var(--accent)'
                      : sendResult.status === 'skipped'
                        ? 'var(--text-dim)'
                        : 'var(--danger)',
                }}
                title={sendResult.reason}
              >
                {sendResult.status === 'sent' ? 'Sent' : sendResult.status === 'skipped' ? 'Skipped' : 'Failed'}
              </span>
            )}
          </div>
          <div className="right">
            <button className="btn" onClick={onClose}>
              Close
            </button>
            {onSend && (
              <button className="btn btn-primary" onClick={onSend} disabled={!preview || !canSend || sending}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
