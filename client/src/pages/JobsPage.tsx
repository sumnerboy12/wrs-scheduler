import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Job, JobWithPhases, Phase } from '../types';
import { JOB_STATUS_LABELS } from '../types';
import JobModal from '../components/JobModal';
import PhaseModal from '../components/PhaseModal';
import ImportModal, { type ImportField } from '../components/ImportModal';
import { matchJobStatus } from '../lib/jobStatus';

const JOB_IMPORT_FIELDS: ImportField[] = [
  { key: 'code', label: 'Job code', aliases: ['job code', 'code', 'job #', 'job number', 'reference', 'ref'] },
  { key: 'name', label: 'Job name', required: true, aliases: ['name', 'job', 'job name', 'project', 'project name', 'title'] },
  { key: 'client_name', label: 'Client', aliases: ['client', 'client name', 'customer', 'customer name'] },
  { key: 'address', label: 'Address', aliases: ['address', 'site address', 'location'] },
  { key: 'status', label: 'Status', aliases: ['status', 'stage'] },
  { key: 'probability', label: 'Win %', aliases: ['probability', 'win probability', 'win %', 'chance', '%'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'description'] },
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<JobWithPhases | null>(null);
  const [showAddJob, setShowAddJob] = useState(false);
  const [showImportJobs, setShowImportJobs] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadJobs = () => api.getJobs().then(setJobs);
  const loadDetail = (id: number) => api.getJob(id).then(setDetail);

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    if (selectedId != null) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]);

  useEffect(() => {
    if (jobs.length && selectedId == null) setSelectedId(jobs[0].id);
  }, [jobs]);

  const visibleJobs = jobs.filter((j) => statusFilter === 'all' || j.status === statusFilter);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 320, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 12, display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: 1 }}>
            <option value="all">All statuses</option>
            {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => setShowImportJobs(true)}>
            Import
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddJob(true)}>
            + Job
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visibleJobs.map((job) => (
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
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: job.color, flexShrink: 0 }} />
                {job.code && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{job.code}</span>}
                <strong style={{ fontSize: 14 }}>{job.name}</strong>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                {job.client_name || 'No client set'} &middot; {JOB_STATUS_LABELS[job.status]}
                {job.status === 'pipeline' && job.probability != null ? ` (${job.probability}%)` : ''}
              </div>
            </div>
          ))}
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
                <h1 style={{ margin: 0, fontSize: 20 }}>
                  {detail.code && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>{detail.code} &middot; </span>}
                  {detail.name}
                </h1>
                <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>{detail.client_name} &middot; {detail.address}</div>
                <span
                  className="badge"
                  style={{ background: detail.color, marginTop: 8, display: 'inline-block' }}
                >
                  {JOB_STATUS_LABELS[detail.status]}
                </span>
              </div>
              <button className="btn" onClick={() => setEditingJob(detail)}>
                Edit Job
              </button>
            </div>

            {detail.notes && (
              <p style={{ color: 'var(--text-dim)', marginTop: 16, whiteSpace: 'pre-wrap' }}>{detail.notes}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Phases</h2>
              <button className="btn btn-primary" onClick={() => setShowAddPhase(true)}>
                + Add Phase
              </button>
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
                      <td>{phase.start_date}</td>
                      <td>{phase.end_date}</td>
                      <td>
                        <button className="btn" onClick={() => setEditingPhase(phase)}>
                          Edit
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
              client_name: values.client_name || null,
              address: values.address || null,
              status,
              probability: probability != null && !Number.isNaN(probability) ? probability : null,
              notes: values.notes || null,
            });
          }}
          onDone={loadJobs}
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
        />
      )}
    </div>
  );
}
