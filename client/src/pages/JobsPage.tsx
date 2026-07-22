import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Client, Employee, Job, JobStatus, JobWithPhases, Phase } from '../types';
import { JOB_STATUS_LABELS } from '../types';
import JobModal from '../components/JobModal';
import PhaseModal from '../components/PhaseModal';
import StatusFilterDropdown, { ALL_STATUSES } from '../components/StatusFilterDropdown';
import ImportModal, { type ImportField } from '../components/ImportModal';
import { matchJobStatus } from '../lib/jobStatus';
import { formatShortDate, parseFlexibleDate } from '../lib/dates';
import { NO_CLIENT_COLOR } from '../lib/colors';
import { useLiveRefresh } from '../lib/useLiveRefresh';

const STATUS_FILTER_KEY = 'rostr-jobs-status-filter';

function loadPersistedStatusFilter(): JobStatus[] {
  try {
    const raw = localStorage.getItem(STATUS_FILTER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // storage unavailable — just use the default
  }
  return ALL_STATUSES;
}

function savePersistedStatusFilter(filter: JobStatus[]) {
  try {
    localStorage.setItem(STATUS_FILTER_KEY, JSON.stringify(filter));
  } catch {
    // storage unavailable — filter just won't persist
  }
}

const JOB_IMPORT_FIELDS: ImportField[] = [
  { key: 'code', label: 'Job code', aliases: ['job code', 'code', 'job #', 'job number', 'reference', 'ref'] },
  { key: 'name', label: 'Job name', required: true, aliases: ['name', 'job', 'job name', 'project', 'project name', 'title'] },
  { key: 'client', label: 'Client', aliases: ['client', 'client name', 'customer', 'customer name'] },
  { key: 'address', label: 'Address', aliases: ['address', 'site address', 'location'] },
  { key: 'status', label: 'Status', aliases: ['status', 'stage'] },
  { key: 'probability', label: 'Win %', aliases: ['probability', 'win probability', 'win %', 'chance', '%'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'description'] },
];

// Start/end aren't `required` here — a row missing either falls back to
// the default start/end dates set in the import UI (see PhasesImportModal
// below), so this is often just a list of phase names.
const PHASE_IMPORT_FIELDS: ImportField[] = [
  { key: 'name', label: 'Phase name', required: true, aliases: ['name', 'phase', 'phase name', 'stage', 'title'] },
  { key: 'start_date', label: 'Start date', aliases: ['start date', 'start', 'from'] },
  { key: 'end_date', label: 'End date', aliases: ['end date', 'end', 'to', 'finish date'] },
  { key: 'sequence', label: 'Order', aliases: ['order', 'sequence', 'seq', '#'] },
  { key: 'estimated_staff', label: 'Estimated staff', aliases: ['estimated staff', 'estimate', 'staff', 'crew size'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'description'] },
];

export default function JobsPage() {
  const { isReadOnly } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<JobWithPhases | null>(null);
  const [showAddJob, setShowAddJob] = useState(false);
  const [showImportJobs, setShowImportJobs] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [showImportPhases, setShowImportPhases] = useState(false);
  const [defaultPhaseStart, setDefaultPhaseStart] = useState('');
  const [defaultPhaseEnd, setDefaultPhaseEnd] = useState('');
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus[]>(loadPersistedStatusFilter);
  const [search, setSearch] = useState('');

  useEffect(() => savePersistedStatusFilter(statusFilter), [statusFilter]);

  // Reloading jobs (e.g. after closing an edit modal) replaces `jobs` with a
  // fresh array, and something about that reorders/reconciles the list in a
  // way that resets its scroll to the top. Rather than chase the exact
  // mechanism, capture the list's scroll position right before each reload
  // and restore it once the new data has rendered.
  const jobListRef = useRef<HTMLDivElement>(null);
  const pendingJobListScrollTop = useRef<number | null>(null);
  const loadJobs = () => {
    if (jobListRef.current) pendingJobListScrollTop.current = jobListRef.current.scrollTop;
    return api.getJobs().then(setJobs);
  };

  useLayoutEffect(() => {
    if (pendingJobListScrollTop.current != null && jobListRef.current) {
      jobListRef.current.scrollTop = pendingJobListScrollTop.current;
      pendingJobListScrollTop.current = null;
    }
  }, [jobs]);
  const loadClients = () => api.getClients().then(setClients);
  const loadEmployees = () => api.getEmployees().then((data) => setEmployees(data.filter((e) => e.active)));
  const loadDetail = (id: number) => api.getJob(id).then(setDetail);

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const clientFor = (job: Job) => (job.client_id != null ? clientsById.get(job.client_id) : undefined);

  // Name -> id cache for the duration of one import run. A ref rather than
  // state because rows import sequentially awaiting each other — reading
  // `clients` state directly wouldn't see a client created two rows ago in
  // the same batch, since it only refreshes from the server once the whole
  // import finishes (see onDone below).
  const importClientCache = useRef<Map<string, number> | null>(null);
  const resolveClientId = async (rawName: string | undefined): Promise<number | null> => {
    const name = rawName?.trim();
    if (!name) return null;
    if (!importClientCache.current) {
      importClientCache.current = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.id]));
    }
    const key = name.toLowerCase();
    const cached = importClientCache.current.get(key);
    if (cached != null) return cached;
    const created = await api.createClient({ name });
    importClientCache.current.set(key, created.id);
    return created.id;
  };

  // Running sequence counter for one phase-import pass — rows without an
  // explicit Order column get appended after whatever phases the job
  // already has, in paste order. A ref (not state) since rows import
  // sequentially and each needs the count as of the row before it.
  const importPhaseSequenceRef = useRef(0);

  useEffect(() => {
    loadJobs();
    loadClients();
    loadEmployees();
  }, []);

  useLiveRefresh(() => {
    loadJobs();
    loadClients();
    loadEmployees();
    if (selectedId != null) loadDetail(selectedId);
  });

  useEffect(() => {
    if (selectedId != null) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]);

  useEffect(() => {
    if (jobs.length && selectedId == null) setSelectedId(jobs[0].id);
  }, [jobs]);

  const visibleJobs = jobs.filter((j) => {
    if (!statusFilter.includes(j.status)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = `${j.name} ${j.code ?? ''} ${clientFor(j)?.name ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 320, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            placeholder="Search name, code, client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
          <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} style={{ flex: 1, width: 'auto' }} />
          {!isReadOnly && (
            <>
              <button
                className="btn"
                onClick={() => {
                  importClientCache.current = null;
                  setShowImportJobs(true);
                }}
              >
                Import
              </button>
              <button className="btn btn-primary" onClick={() => setShowAddJob(true)}>
                + Job
              </button>
            </>
          )}
          </div>
        </div>
        <div ref={jobListRef} style={{ overflowY: 'auto', flex: 1 }}>
          {visibleJobs.map((job) => {
            const client = clientFor(job);
            const jobColor = client?.color ?? NO_CLIENT_COLOR;
            return (
              <div
                key={job.id}
                onClick={() => setSelectedId(job.id)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  background: job.id === selectedId ? 'var(--panel-alt)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: jobColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 14 }}>{job.name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '1px 7px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      background: jobColor,
                      color: '#fff',
                    }}
                  >
                    {client?.name ?? 'No client set'}
                  </span>
                  <span>&middot;</span>
                  <span>{JOB_STATUS_LABELS[job.status]}</span>
                  {job.status !== 'pipeline' && job.status !== 'quoted' && job.code && (
                    <>
                      <span>&middot;</span>
                      <span>{job.code}</span>
                    </>
                  )}
                  {(job.status === 'pipeline' || job.status === 'quoted') && job.probability != null && (
                    <>
                      <span>&middot;</span>
                      <span>{job.probability}%</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {visibleJobs.length === 0 && (
            <div style={{ padding: 20, color: 'var(--text-dim)', textAlign: 'center' }}>No jobs match this filter.</div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
        {detail ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 20 }}>{detail.name}</h1>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '1px 7px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      background: clientFor(detail)?.color ?? NO_CLIENT_COLOR,
                      color: '#fff',
                    }}
                  >
                    {clientFor(detail)?.name ?? 'No client set'}
                  </span>
                  <span>&middot;</span>
                  <span>{JOB_STATUS_LABELS[detail.status]}</span>
                  {detail.status !== 'pipeline' && detail.status !== 'quoted' && detail.code && (
                    <>
                      <span>&middot;</span>
                      <span>{detail.code}</span>
                    </>
                  )}
                  {(detail.status === 'pipeline' || detail.status === 'quoted') && detail.probability != null && (
                    <>
                      <span>&middot;</span>
                      <span>{detail.probability}%</span>
                    </>
                  )}
                </div>
                {detail.address && <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>{detail.address}</div>}
              </div>
              <button className="btn" onClick={() => setEditingJob(detail)}>
                {isReadOnly ? 'View Job' : 'Edit Job'}
              </button>
            </div>

            {detail.notes && (
              <p style={{ color: 'var(--text-dim)', marginTop: 16, whiteSpace: 'pre-wrap' }}>{detail.notes}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Phases</h2>
              {!isReadOnly && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn"
                    onClick={() => {
                      importPhaseSequenceRef.current = detail.phases.length;
                      setDefaultPhaseStart('');
                      setDefaultPhaseEnd('');
                      setShowImportPhases(true);
                    }}
                  >
                    Import
                  </button>
                  <button className="btn btn-primary" onClick={() => setShowAddPhase(true)}>
                    + Add Phase
                  </button>
                </div>
              )}
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Phase</th>
                    <th>Start</th>
                    <th>End</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.phases.map((phase) => (
                    <tr key={phase.id} style={{ opacity: phase.complete ? 0.5 : 1 }}>
                      <td>{phase.sequence}</td>
                      <td>
                        {phase.name}
                        {phase.complete === 1 && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--text-dim)' }}>
                            Complete
                          </span>
                        )}
                      </td>
                      <td>{formatShortDate(phase.start_date)}</td>
                      <td>{formatShortDate(phase.end_date)}</td>
                      <td>
                        <button className="btn" onClick={() => setEditingPhase(phase)}>
                          {isReadOnly ? 'View' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {detail.phases.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                        No phases yet. Break this job down (e.g. Tear-off, Install, Flashing) to assign staff per stage.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--text-dim)' }}>Select a job on the left, or create a new one.</div>
        )}
      </div>

      {showAddJob && (
        <JobModal
          job={null}
          clients={clients}
          employees={employees}
          onClose={() => setShowAddJob(false)}
          onSave={async (data) => {
            const created = await api.createJob(data);
            await loadJobs();
            setSelectedId(created.id);
          }}
        />
      )}
      {editingJob && (
        <JobModal
          job={editingJob}
          clients={clients}
          employees={employees}
          onClose={() => setEditingJob(null)}
          onSave={async (data) => {
            await api.updateJob(editingJob.id, data);
            await loadJobs();
            if (selectedId === editingJob.id) loadDetail(editingJob.id);
          }}
          onDelete={async (id) => {
            await api.deleteJob(id);
            if (selectedId === id) setSelectedId(null);
            await loadJobs();
          }}
          readOnly={isReadOnly}
        />
      )}
      {showImportJobs && (
        <ImportModal
          title="Import Jobs"
          fields={JOB_IMPORT_FIELDS}
          helpText="Paste columns like Job code, Job name, Client, Address, Status, Win %, Notes. Phases can be added afterwards from the job's detail page."
          onClose={() => setShowImportJobs(false)}
          onImportRow={async (values) => {
            const { status } = values.status ? matchJobStatus(values.status) : { status: 'pipeline' as const };
            const probability = values.probability ? Number(values.probability.replace('%', '')) : null;
            await api.createJob({
              code: values.code || null,
              name: values.name,
              client_id: await resolveClientId(values.client),
              address: values.address || null,
              status,
              probability: probability != null && !Number.isNaN(probability) ? probability : null,
              notes: values.notes || null,
            });
          }}
          onDone={() => {
            loadJobs();
            loadClients();
          }}
        />
      )}
      {showAddPhase && detail && (
        <PhaseModal
          phase={null}
          defaultSequence={detail.phases.length + 1}
          onClose={() => setShowAddPhase(false)}
          onSave={async (data) => {
            await api.createPhase(detail.id, data);
            loadDetail(detail.id);
          }}
        />
      )}
      {showImportPhases && detail && (
        <ImportModal
          title={`Import Phases — ${detail.name}`}
          fields={PHASE_IMPORT_FIELDS}
          helpText="Paste columns like Phase name, Start date, End date, Order, Estimated staff, Notes — or just a list of phase names and set default dates below."
          extraContent={
            <div className="card" style={{ padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
                Default dates — used for any row with no start/end date of its own.
              </div>
              <div className="row">
                <div className="field">
                  <label>Default start date</label>
                  <input type="date" value={defaultPhaseStart} onChange={(e) => setDefaultPhaseStart(e.target.value)} />
                </div>
                <div className="field">
                  <label>Default end date</label>
                  <input type="date" value={defaultPhaseEnd} onChange={(e) => setDefaultPhaseEnd(e.target.value)} />
                </div>
              </div>
            </div>
          }
          onClose={() => setShowImportPhases(false)}
          onImportRow={async (values) => {
            const rowStart = values.start_date.trim() ? parseFlexibleDate(values.start_date) : null;
            const rowEnd = values.end_date.trim() ? parseFlexibleDate(values.end_date) : null;
            if (values.start_date.trim() && !rowStart) throw new Error(`Could not read start date "${values.start_date}"`);
            if (values.end_date.trim() && !rowEnd) throw new Error(`Could not read end date "${values.end_date}"`);

            const startDate = rowStart ?? defaultPhaseStart;
            const endDate = rowEnd ?? defaultPhaseEnd;
            if (!startDate) throw new Error('No start date in the row, and no default start date set');
            if (!endDate) throw new Error('No end date in the row, and no default end date set');
            if (endDate < startDate) throw new Error('End date is before the start date');

            importPhaseSequenceRef.current += 1;
            const sequence = values.sequence.trim() ? Number(values.sequence) : importPhaseSequenceRef.current;
            const estimatedStaff = values.estimated_staff.trim() ? Number(values.estimated_staff) : null;

            await api.createPhase(detail.id, {
              name: values.name,
              sequence: Number.isNaN(sequence) ? importPhaseSequenceRef.current : sequence,
              start_date: startDate,
              end_date: endDate,
              estimated_staff: estimatedStaff != null && !Number.isNaN(estimatedStaff) ? estimatedStaff : null,
              notes: values.notes || null,
            });
          }}
          onDone={() => loadDetail(detail.id)}
        />
      )}
      {editingPhase && detail && (
        <PhaseModal
          phase={editingPhase}
          defaultSequence={editingPhase.sequence}
          onClose={() => setEditingPhase(null)}
          onSave={async (data) => {
            await api.updatePhase(editingPhase.id, data);
            loadDetail(detail.id);
          }}
          onDelete={async (id) => {
            await api.deletePhase(id);
            loadDetail(detail.id);
          }}
          readOnly={isReadOnly}
        />
      )}
    </div>
  );
}
