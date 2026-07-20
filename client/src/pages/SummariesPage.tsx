import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { EmployeeSummary, SendSummariesResult, SummaryPreview, SummaryTemplate } from '../types';
import { addDays, formatShortDate, startOfWeek, toISODate } from '../lib/dates';
import SummaryTemplateModal from '../components/SummaryTemplateModal';
import SummaryPreviewModal from '../components/SummaryPreviewModal';

const RANGE_STORAGE_KEY = 'rostr-summaries-range';
const INCLUDE_WEEKENDS_KEY = 'rostr-summaries-include-weekends';

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

export default function SummariesPage() {
  const { isReadOnly } = useAuth();
  const [includeWeekends, setIncludeWeekends] = useState(loadPersistedIncludeWeekends);
  const [{ start, end }, setRange] = useState(loadPersistedRange);
  const [loading, setLoading] = useState(true);
  const [mailConfigured, setMailConfigured] = useState(true);
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

  const load = () => {
    setLoading(true);
    setError(null);
    setResults(null);
    api
      .getSummaries(start, end)
      .then((data) => {
        setEmployees(data.employees);
        setMailConfigured(data.mailConfigured);
        // Pre-check anyone who actually has bookings this range — an empty
        // summary is more often "nothing to say" than "please email them".
        setSelected(new Set(data.employees.filter((e) => e.items.length > 0).map((e) => e.id)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [start, end]);
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

  const resultFor = (id: number) => results?.find((r) => r.employee_id === id);

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

  const openPreview = async (emp: EmployeeSummary) => {
    setPreviewing(emp);
    setPreviewData(null);
    setPreviewError(null);
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
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Summaries</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
      </div>

      <p style={{ color: 'var(--text-dim)', marginTop: -8 }}>
        Each active employee's bookings for the selected date range, ready to email as a
        weekly schedule.
      </p>

      {!mailConfigured && (
        <div style={{ color: 'var(--danger)', marginBottom: 12 }}>
          Email isn't configured on this server yet, so sending is disabled — you can still
          preview what would go out. See <code>server/.env.example</code>.
        </div>
      )}
      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
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
                      {emp.items.length === 0 ? (
                        <span style={{ color: 'var(--text-dim)' }}>Nothing scheduled</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {emp.items.map((item, i) => (
                            <div key={i} style={{ fontSize: 13 }}>
                              <span style={{ color: 'var(--text-dim)' }}>
                                {formatShortDate(item.start_date)} – {formatShortDate(item.end_date)}:
                              </span>{' '}
                              {item.job_code ? `${item.job_code} — ` : ''}
                              {item.job_name} — {item.phase_name}
                              {item.allocation_pct < 100 ? ` (${item.allocation_pct}%)` : ''}
                            </div>
                          ))}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <button className="btn btn-primary" onClick={openTemplateEditor}>
            Edit template
          </button>
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
          onClose={() => setEditingTemplate(false)}
          onSave={async (data) => {
            const saved = await api.updateSummaryTemplate(data);
            setTemplate(saved);
          }}
        />
      )}
      {previewing && (
        <SummaryPreviewModal
          employeeName={previewing.name}
          preview={previewData}
          loading={previewLoading}
          error={previewError}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
