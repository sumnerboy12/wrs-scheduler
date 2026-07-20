import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Client, Job, JobStatus, JobWithPhases, Phase } from '../types';
import { JOB_STATUS_LABELS } from '../types';
import JobModal from '../components/JobModal';
import PhaseModal from '../components/PhaseModal';
import StatusFilterDropdown, { ALL_STATUSES } from '../components/StatusFilterDropdown';
import ImportModal, { type ImportField } from '../components/ImportModal';
import { matchJobStatus } from '../lib/jobStatus';
import { formatShortDate } from '../lib/dates';
import { NO_CLIENT_COLOR } from '../lib/colors';

const JOB_IMPORT_FIELDS: ImportField[] = [
  { key: 'code', label: 'Job code', aliases: ['job code', 'code', 'job #', 'job number', 'reference', 'ref'] },
  { key: 'name', label: 'Job name', required: true, aliases: ['name', 'job', 'job name', 'project', 'project name', 'title'] },
  { key: 'client', label: 'Client', aliases: ['client', 'client name', 'customer', 'customer name'] },
  { key: 'address', label: 'Address', aliases: ['address', 'site address', 'location'] },
  { key: 'status', label: 'Status', aliases: ['status', 'stage'] },
  { key: 'probability', label: 'Win %', aliases: ['probability', 'win probability', 'win %', 'chance', '%'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'description'] },
];

export default function JobsPage() {
  const { isReadOnly } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<JobWithPhases | null>(null);
  const [showAddJob, setShowAddJob] = useState(false);
  const [showImportJobs, setShowImportJobs] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus[]>(ALL_STATUSES);
  const [search, setSearch] = useState('');

  const loadJobs = () => api.getJobs().then(setJobs);
  const loadClients = () => api.getClients().then(setClients);
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

  useEffect(() => {
    loadJobs();
    loadClients();
  }, []);

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
        <div style={{ overflowY: 'auto', flex: 1 }}>
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
                  <strong style={{ fontSize: 14 }}>{job.name}</strong>
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
                <button className="btn btn-primary" onClick={() => setShowAddPhase(true)}>
                  + Add Phase
                </button>
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
                    <tr key={phase.id}>
                      <td>{phase.sequence}</td>
                      <td>{phase.name}</td>
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
