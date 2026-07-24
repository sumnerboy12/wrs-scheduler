import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { AutoSendConfig, JobSummary, SendJobSummariesResult, SummaryPreview, SummaryTemplate } from '../types';
import { addDays, formatShortDate, startOfWeek, toISODate } from '../lib/dates';
import SummaryTemplateModal, { JOB_SUMMARY_PLACEHOLDERS } from './SummaryTemplateModal';
import SummaryPreviewModal from './SummaryPreviewModal';
import AutoSendSettingsModal from './AutoSendSettingsModal';

const RANGE_STORAGE_KEY = 'rostr-job-summaries-range';
const INCLUDE_WEEKENDS_KEY = 'rostr-job-summaries-include-weekends';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function thisWeekRange(): { start: string; end: string } {
  const monday = startOfWeek(new Date());
  return { start: toISODate(monday), end: toISODate(addDays(monday, 6)) };
}

function nextWeekRange(): { start: string; end: string } {
  const nextMonday = addDays(startOfWeek(new Date()), 7);
  return { start: toISODate(nextMonday), end: toISODate(addDays(nextMonday, 6)) };
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

function loadPersistedIncludeWeekends(): boolean {
  try {
    return localStorage.getItem(INCLUDE_WEEKENDS_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function JobSummariesTab() {
  const { isReadOnly } = useAuth();
  const [includeWeekends, setIncludeWeekends] = useState(loadPersistedIncludeWeekends);
  const [{ start, end }, setRange] = useState(loadPersistedRange);
  const [loading, setLoading] = useState(true);
  const [mailConfigured, setMailConfigured] = useState(true);
  const [alreadySent, setAlreadySent] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendJobSummariesResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<SummaryTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [previewing, setPreviewing] = useState<JobSummary | null>(null);
  const [previewData, setPreviewData] = useState<SummaryPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSending, setPreviewSending] = useState(false);
  const [previewSendResult, setPreviewSendResult] = useState<SendJobSummariesResult | null>(null);
  const [autoSendConfig, setAutoSendConfig] = useState<AutoSendConfig | null>(null);
  const [editingAutoSend, setEditingAutoSend] = useState(false);

  useEffect(() => {
    api.getJobAutoSendConfig().then(setAutoSendConfig).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    setResults(null);
    api
      .getJobSummaries(start, end)
      .then((data) => {
        setJobs(data.jobs);
        setMailConfigured(data.mailConfigured);
        setAlreadySent(data.alreadySent);
        // Pre-check anyone who actually has crew booked this range — an
        // empty summary is more often "nothing to say" than "please email".
        setSelected(new Set(data.jobs.filter((j) => j.items.length > 0).map((j) => j.id)));
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
      const { results } = await api.sendJobSummaries(start, end, Array.from(selected), includeWeekends);
      setResults(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  // See EmployeeSummariesTab's handleMarkSent for the full reasoning —
  // deliberately separate from handleSend so sending to one or two
  // supervisors ad hoc never silently suppresses the scheduled batch for
  // everyone else.
  const handleMarkSent = async () => {
    setMarkingSent(true);
    setError(null);
    try {
      await api.markJobSummariesSent(start, end);
      setAlreadySent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark as sent');
    } finally {
      setMarkingSent(false);
    }
  };

  const resultFor = (id: number) => results?.find((r) => r.job_id === id);

  // Ad-hoc single-job re-send from inside the preview modal, independent of
  // the checkbox selection — its result is merged into the same `results`
  // list so the row's status column in the main table updates too.
  const handleSendFromPreview = async () => {
    if (!previewing) return;
    setPreviewSending(true);
    setPreviewSendResult(null);
    try {
      const { results: rowResults } = await api.sendJobSummaries(start, end, [previewing.id], includeWeekends);
      setResults((prev) => [...(prev ?? []).filter((r) => r.job_id !== previewing.id), ...rowResults]);
      setPreviewSendResult(rowResults[0] ?? null);
    } catch (e) {
      setPreviewSendResult({
        job_id: previewing.id,
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
        setTemplate(await api.getJobSummaryTemplate());
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
        setAutoSendConfig(await api.getJobAutoSendConfig());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load auto-send settings');
        return;
      }
    }
    setEditingAutoSend(true);
  };

  const openPreview = async (job: JobSummary) => {
    setPreviewing(job);
    setPreviewData(null);
    setPreviewError(null);
    setPreviewSendResult(null);
    setPreviewLoading(true);
    try {
      setPreviewData(await api.previewJobSummary(job.id, start, end, includeWeekends));
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Every job with a supervisor set (see a job's <strong>Edit Job</strong> form) and its crew
        for the selected date range, ready to email the supervisor a heads-up on who's booked.
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
            {alreadySent ? 'Already sent for these dates' : 'Not yet sent for these dates'}
          </span>
          {!isReadOnly && !alreadySent && (
            <button
              className="btn"
              onClick={handleMarkSent}
              disabled={markingSent}
              style={{ fontSize: 11, padding: '2px 8px' }}
              title="Flags these dates as already sent so the scheduled auto-send skips them — use this if you've sent this batch some other way, not for an ad-hoc resend to one or two supervisors."
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
                    checked={jobs.length > 0 && selected.size === jobs.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && selected.size < jobs.length;
                    }}
                    onChange={(e) => setSelected(e.target.checked ? new Set(jobs.map((j) => j.id)) : new Set())}
                    disabled={isReadOnly || jobs.length === 0}
                  />
                </th>
                <th>Job</th>
                <th>Supervisor</th>
                <th>Crew this range</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const result = resultFor(job.id);
                return (
                  <tr key={job.id}>
                    <td>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={selected.has(job.id)}
                        onChange={() => toggle(job.id)}
                        disabled={isReadOnly}
                      />
                    </td>
                    <td>
                      {job.code ? `${job.code} — ` : ''}
                      {job.name}
                    </td>
                    <td>
                      <div>{job.supervisor_name}</div>
                      <div style={{ fontSize: 12, color: job.supervisor_email ? 'var(--text-dim)' : 'var(--danger)' }}>
                        {job.supervisor_email || 'No email on file'}
                      </div>
                    </td>
                    <td>
                      {job.items.length === 0 ? (
                        <span style={{ color: 'var(--text-dim)' }}>No one scheduled</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {job.items.map((item, i) => (
                            <div key={i} style={{ fontSize: 13 }}>
                              <span style={{ color: 'var(--text-dim)' }}>
                                {formatShortDate(item.start_date)} – {formatShortDate(item.end_date)}:
                              </span>{' '}
                              {item.employee_name} — {item.phase_name}
                              {item.allocation_pct < 100 ? ` (${item.allocation_pct}%)` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <button className="btn" onClick={() => openPreview(job)}>
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
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No jobs have a supervisor set. Add one from a job's Edit form.
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
          placeholders={JOB_SUMMARY_PLACEHOLDERS}
          onClose={() => setEditingTemplate(false)}
          onSave={async (data) => {
            const saved = await api.updateJobSummaryTemplate(data);
            setTemplate(saved);
          }}
        />
      )}
      {previewing && (
        <SummaryPreviewModal
          title={previewing.code ? `${previewing.code} — ${previewing.name}` : previewing.name}
          preview={previewData}
          loading={previewLoading}
          error={previewError}
          onClose={() => setPreviewing(null)}
          onSend={!isReadOnly ? handleSendFromPreview : undefined}
          sending={previewSending}
          sendResult={previewSendResult}
          canSend={mailConfigured && Boolean(previewing.supervisor_email)}
        />
      )}
      {editingAutoSend && autoSendConfig && (
        <AutoSendSettingsModal
          config={autoSendConfig}
          description="Sends to every job with a supervisor, at least one crew booking next week (Mon–Sun), and a supervisor with an email on file. Turn this off any time to go back to sending manually."
          onClose={() => setEditingAutoSend(false)}
          onSave={async (data) => {
            const saved = await api.updateJobAutoSendConfig(data);
            setAutoSendConfig(saved);
          }}
        />
      )}
    </>
  );
}
