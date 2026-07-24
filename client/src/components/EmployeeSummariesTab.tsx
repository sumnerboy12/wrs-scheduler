import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { AutoSendConfig, EmployeeSummary, SendSummariesResult, SummaryPreview, SummaryTemplate } from '../types';
import { LEAVE_TYPE_LABELS } from '../types';
import { addDays, formatShortDate, startOfWeek, toISODate } from '../lib/dates';
import SummaryTemplateModal, { EMPLOYEE_SUMMARY_PLACEHOLDERS } from './SummaryTemplateModal';
import SummaryPreviewModal from './SummaryPreviewModal';
import AutoSendSettingsModal from './AutoSendSettingsModal';

const RANGE_STORAGE_KEY = 'rostr-summaries-range';
const INCLUDE_WEEKENDS_KEY = 'rostr-summaries-include-weekends';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

// Monday–Sunday of the current week.
function thisWeekRange(): { start: string; end: string } {
  const monday = startOfWeek(new Date());
  return { start: toISODate(monday), end: toISODate(addDays(monday, 6)) };
}

// Monday–Sunday of next week, always the full week — startOfWeek gives
// this week's Monday regardless of today's weekday, so +7 days always
// lands on next week's Monday even if today already is one. "Include
// weekends" doesn't affect this: it only decides whether Saturday/Sunday
// rows show up in the rendered bookings table, not which dates are picked.
function nextWeekRange(): { start: string; end: string } {
  const nextMonday = addDays(startOfWeek(new Date()), 7);
  return { start: toISODate(nextMonday), end: toISODate(addDays(nextMonday, 6)) };
}

function loadPersistedIncludeWeekends(): boolean {
  try {
    return localStorage.getItem(INCLUDE_WEEKENDS_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadPersistedRange(): { start: string; end: string } {
  try {
    const raw = localStorage.getItem(RANGE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // storage unavailable (e.g. private browsing) — just use the default
  }
  return nextWeekRange();
}

function savePersistedRange(range: { start: string; end: string }) {
  try {
    localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(range));
  } catch {
    // storage unavailable — range just won't persist
  }
}

export default function EmployeeSummariesTab() {
  const { isReadOnly } = useAuth();
  const [includeWeekends, setIncludeWeekends] = useState(loadPersistedIncludeWeekends);
  const [{ start, end }, setRange] = useState(loadPersistedRange);
  const [loading, setLoading] = useState(true);
  const [mailConfigured, setMailConfigured] = useState(true);
  const [alreadySent, setAlreadySent] = useState(false);
  const [lastSentEnd, setLastSentEnd] = useState<string | null>(null);
  const [markingSent, setMarkingSent] = useState(false);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendSummariesResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<SummaryTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [previewing, setPreviewing] = useState<EmployeeSummary | null>(null);
  const [previewData, setPreviewData] = useState<SummaryPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSending, setPreviewSending] = useState(false);
  const [previewSendResult, setPreviewSendResult] = useState<SendSummariesResult | null>(null);
  const [autoSendConfig, setAutoSendConfig] = useState<AutoSendConfig | null>(null);
  const [editingAutoSend, setEditingAutoSend] = useState(false);

  useEffect(() => {
    api.getAutoSendConfig().then(setAutoSendConfig).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    setResults(null);
    api
      .getSummaries(start, end, includeWeekends)
      .then((data) => {
        setEmployees(data.employees);
        setMailConfigured(data.mailConfigured);
        setAlreadySent(data.alreadySent);
        setLastSentEnd(data.lastSentEnd);
        // Pre-check anyone who actually has bookings or leave this range —
        // an empty summary is more often "nothing to say" than "please
        // email them". Someone on leave for the entire range is excluded
        // even though they technically have leave rows — there's nothing
        // else to report either way, so the email would just be noise
        // (still there to tick by hand if that's actually wanted).
        setSelected(
          new Set(
            data.employees
              .filter((e) => (e.items.length > 0 || e.leave.length > 0) && !e.on_leave_full_period)
              .map((e) => e.id)
          )
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  // includeWeekends affects on_leave_full_period (a Mon–Fri-only leave
  // span counts as "full period" only when weekends aren't part of the
  // email), so toggling it needs a refetch, not just a local re-render.
  useEffect(load, [start, end, includeWeekends]);
  useEffect(() => savePersistedRange({ start, end }), [start, end]);
  useEffect(() => {
    try {
      localStorage.setItem(INCLUDE_WEEKENDS_KEY, String(includeWeekends));
    } catch {
      // storage unavailable — just won't persist
    }
  }, [includeWeekends]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const { results } = await api.sendSummaries(start, end, Array.from(selected), includeWeekends);
      setResults(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  // Lets an admin flag this range as already handled — e.g. sent some other
  // way entirely, or catching up after an outage — without that being an
  // automatic side effect of an ordinary send (which might only cover one
  // or two people, not the whole week's batch). Deliberately separate from
  // handleSend so a partial manual send never silently suppresses the
  // scheduled auto-send for everyone else.
  const handleMarkSent = async () => {
    setMarkingSent(true);
    setError(null);
    try {
      await api.markSummariesSent(start, end);
      setAlreadySent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark as sent');
    } finally {
      setMarkingSent(false);
    }
  };

  const resultFor = (id: number) => results?.find((r) => r.employee_id === id);

  // Ad-hoc single-employee re-send from inside the preview modal, independent
  // of the checkbox selection — its result is merged into the same `results`
  // list so the row's status column in the main table updates too.
  const handleSendFromPreview = async () => {
    if (!previewing) return;
    setPreviewSending(true);
    setPreviewSendResult(null);
    try {
      const { results: rowResults } = await api.sendSummaries(start, end, [previewing.id], includeWeekends);
      setResults((prev) => [...(prev ?? []).filter((r) => r.employee_id !== previewing.id), ...rowResults]);
      setPreviewSendResult(rowResults[0] ?? null);
    } catch (e) {
      setPreviewSendResult({
        employee_id: previewing.id,
        name: previewing.name,
        status: 'failed',
        reason: e instanceof Error ? e.message : 'Failed to send',
      });
    } finally {
      setPreviewSending(false);
    }
  };

  const openTemplateEditor = async () => {
    if (!template) {
      try {
        setTemplate(await api.getSummaryTemplate());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load template');
        return;
      }
    }
    setEditingTemplate(true);
  };

  const openAutoSendEditor = async () => {
    if (!autoSendConfig) {
      try {
        setAutoSendConfig(await api.getAutoSendConfig());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load auto-send settings');
        return;
      }
    }
    setEditingAutoSend(true);
  };

  // A range that's entirely before whatever was last sent is old news — a
  // plain "not sent" reading would be misleading (it's not that anyone
  // forgot it, it's just superseded by a later batch), so the pill says so
  // explicitly instead, and the "mark as sent" action hides since marking a
  // stale range doesn't mean anything.
  const isBeforeLastSent = lastSentEnd !== null && end < lastSentEnd;

  const openPreview = async (emp: EmployeeSummary) => {
    setPreviewing(emp);
    setPreviewData(null);
    setPreviewError(null);
    setPreviewSendResult(null);
    setPreviewLoading(true);
    try {
      setPreviewData(await api.previewSummary(emp.id, start, end, includeWeekends));
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Each active employee's bookings and leave for the selected date range, ready to email
        as a weekly schedule.
      </p>

      {!mailConfigured && (
        <div style={{ color: 'var(--danger)', marginBottom: 12 }}>
          Email isn't configured on this server yet, so sending is disabled — you can still
          preview what would go out. See <code>server/.env.example</code>.
        </div>
      )}
      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={includeWeekends}
            onChange={(e) => setIncludeWeekends(e.target.checked)}
          />
          Include weekends
        </label>
        <button className="btn" onClick={() => setRange(thisWeekRange())}>
          This week
        </button>
        <button className="btn" onClick={() => setRange(nextWeekRange())}>
          Next week
        </button>
        <input type="date" value={start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
        <span style={{ color: 'var(--text-dim)' }}>to</span>
        <input type="date" value={end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
      </div>

      {!loading && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 999,
              color: alreadySent ? 'var(--accent)' : 'var(--text-dim)',
              background: alreadySent ? 'var(--panel-alt)' : 'transparent',
            }}
          >
            {isBeforeLastSent
              ? 'Past period — not tracked'
              : alreadySent
                ? 'Already sent for these dates'
                : 'Not yet sent for these dates'}
          </span>
          {!isReadOnly && !alreadySent && !isBeforeLastSent && (
            <button
              className="btn"
              onClick={handleMarkSent}
              disabled={markingSent}
              style={{ fontSize: 11, padding: '2px 8px' }}
              title="Flags these dates as already sent so the scheduled auto-send skips them — use this if you've sent this batch some other way, not for an ad-hoc resend to one or two people."
            >
              {markingSent ? 'Marking…' : 'Manually sent'}
            </button>
          )}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={employees.length > 0 && selected.size === employees.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && selected.size < employees.length;
                    }}
                    onChange={(e) => setSelected(e.target.checked ? new Set(employees.map((emp) => emp.id)) : new Set())}
                    disabled={isReadOnly || employees.length === 0}
                  />
                </th>
                <th>Employee</th>
                <th>Bookings this range</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const result = resultFor(emp.id);
                return (
                  <tr key={emp.id}>
                    <td>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={selected.has(emp.id)}
                        onChange={() => toggle(emp.id)}
                        disabled={isReadOnly}
                      />
                    </td>
                    <td>
                      <div>{emp.name}</div>
                      <div style={{ fontSize: 12, color: emp.email ? 'var(--text-dim)' : 'var(--danger)' }}>
                        {emp.email || 'No email on file'}
                      </div>
                    </td>
                    <td>
                      {emp.items.length === 0 && emp.leave.length === 0 ? (
                        <span style={{ color: 'var(--text-dim)' }}>Nothing scheduled</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {emp.leave.map((l, i) => (
                            <div key={`leave-${i}`} style={{ fontSize: 13 }}>
                              <span style={{ color: 'var(--text-dim)' }}>
                                {formatShortDate(l.start_date)} – {formatShortDate(l.end_date)}:
                              </span>{' '}
                              Leave — {LEAVE_TYPE_LABELS[l.type]}
                            </div>
                          ))}
                          {emp.items.map((item, i) => (
                            <div key={`item-${i}`} style={{ fontSize: 13 }}>
                              <span style={{ color: 'var(--text-dim)' }}>
                                {formatShortDate(item.start_date)} – {formatShortDate(item.end_date)}:
                              </span>{' '}
                              {item.job_code ? `${item.job_code} — ` : ''}
                              {item.job_name} — {item.phase_name}
                              {item.allocation_pct < 100 ? ` (${item.allocation_pct}%)` : ''}
                            </div>
                          ))}
                          {emp.on_leave_full_period && (
                            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                              On leave for the whole period — not ticked by default
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <button className="btn" onClick={() => openPreview(emp)}>
                        Preview
                      </button>
                    </td>
                    <td>
                      {result && (
                        <span
                          style={{
                            fontSize: 12,
                            color:
                              result.status === 'sent'
                                ? 'var(--accent)'
                                : result.status === 'skipped'
                                  ? 'var(--text-dim)'
                                  : 'var(--danger)',
                          }}
                          title={result.reason}
                        >
                          {result.status === 'sent' ? 'Sent' : result.status === 'skipped' ? 'Skipped' : 'Failed'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No active employees.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {!isReadOnly && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={openTemplateEditor}>
              Edit template
            </button>
            <button className="btn" onClick={openAutoSendEditor}>
              Auto-send settings
            </button>
            {autoSendConfig && (
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {autoSendConfig.enabled
                  ? `Auto-send: ON — ${DAY_NAMES[autoSendConfig.dayOfWeek]}s ${formatTime12h(autoSendConfig.time)}`
                  : 'Auto-send: OFF'}
              </span>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={sending || !mailConfigured || selected.size === 0}
          >
            {sending ? 'Sending…' : `Send ${selected.size} summar${selected.size === 1 ? 'y' : 'ies'}`}
          </button>
        </div>
      )}

      {editingTemplate && template && (
        <SummaryTemplateModal
          template={template}
          placeholders={EMPLOYEE_SUMMARY_PLACEHOLDERS}
          onClose={() => setEditingTemplate(false)}
          onSave={async (data) => {
            const saved = await api.updateSummaryTemplate(data);
            setTemplate(saved);
          }}
        />
      )}
      {previewing && (
        <SummaryPreviewModal
          title={previewing.name}
          preview={previewData}
          loading={previewLoading}
          error={previewError}
          onClose={() => setPreviewing(null)}
          onSend={!isReadOnly ? handleSendFromPreview : undefined}
          sending={previewSending}
          sendResult={previewSendResult}
          canSend={mailConfigured && Boolean(previewing.email)}
        />
      )}
      {editingAutoSend && autoSendConfig && (
        <AutoSendSettingsModal
          config={autoSendConfig}
          description="Sends to every active employee with a booking next week (Mon–Sun) and an email on file. Turn this off any time to go back to sending manually."
          onClose={() => setEditingAutoSend(false)}
          onSave={async (data) => {
            const saved = await api.updateAutoSendConfig(data);
            setAutoSendConfig(saved);
          }}
        />
      )}
    </>
  );
}
