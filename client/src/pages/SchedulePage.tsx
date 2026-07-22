import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Assignment, Employee, Job, JobStatus, Phase, TimelinePayload } from '../types';
import { JOB_STATUS_LABELS } from '../types';
import TimelineView, { type TimelineViewHandle, type TLGroup, type TLItem } from '../components/TimelineView';
import AssignmentModal from '../components/AssignmentModal';
import JobModal from '../components/JobModal';
import PhaseModal from '../components/PhaseModal';
import EmployeeModal from '../components/EmployeeModal';
import StatusFilterDropdown, { ACTIVE_STATUSES } from '../components/StatusFilterDropdown';
import {
  addDays,
  addMonths,
  formatShortDate,
  isoDatePlusOne,
  parseISODateLocal,
  presetWindow,
  startOfMonth,
  toISODate,
  type ZoomPreset,
} from '../lib/dates';
import { escapeHtml } from '../lib/html';
import { nzHolidaysInRange } from '../lib/nzHolidays';
import { NO_CLIENT_COLOR } from '../lib/colors';
import { useLiveRefresh } from '../lib/useLiveRefresh';

type GroupMode = 'employee' | 'job';

const TENTATIVE_STATUSES = new Set(['pipeline', 'quoted']);

const VIEW_STORAGE_KEY = 'rostr-schedule-view';

interface PersistedView {
  groupMode: GroupMode;
  preset: ZoomPreset;
  statusFilter: JobStatus[];
  start: string;
  end: string;
}

function loadPersistedView(): PersistedView | null {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedView) : null;
  } catch {
    return null;
  }
}

function savePersistedView(state: PersistedView) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (e.g. private browsing) — view just won't persist
  }
}

// Separate key from PersistedView above — this changes far more often (any
// collapse/expand click) and isn't tied to the window/range persistence
// timing, so there's no reason to couple them.
const COLLAPSED_JOBS_KEY = 'rostr-schedule-collapsed-jobs';

function loadCollapsedJobIds(): number[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_JOBS_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function saveCollapsedJobIds(ids: number[]) {
  try {
    localStorage.setItem(COLLAPSED_JOBS_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable — collapse state just won't persist
  }
}

function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export default function SchedulePage() {
  const { isReadOnly } = useAuth();
  const [data, setData] = useState<TimelinePayload | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>(() => loadPersistedView()?.groupMode ?? 'employee');
  const [preset, setPreset] = useState<ZoomPreset>(() => loadPersistedView()?.preset ?? 'month');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus[]>(() => loadPersistedView()?.statusFilter ?? ACTIVE_STATUSES);
  const [window, setWindow] = useState<{ start: Date; end: Date } | null>(() => {
    const persisted = loadPersistedView();
    if (persisted) return { start: new Date(persisted.start), end: new Date(persisted.end) };
    return presetWindow('month', new Date());
  });
  const [collapsedJobIds, setCollapsedJobIds] = useState<number[]>(() => loadCollapsedJobIds());
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [creating, setCreating] = useState<{ employeeId?: number; jobId?: number; phaseId?: number; date?: string } | null>(null);

  const centerRef = useRef(window ? new Date((window.start.getTime() + window.end.getTime()) / 2) : new Date());
  const timelineViewRef = useRef<TimelineViewHandle>(null);

  const load = () => api.getTimeline().then(setData);
  useEffect(() => {
    load();
  }, []);
  useLiveRefresh(load);

  const jobsById = useMemo(() => new Map((data?.jobs ?? []).map((j) => [j.id, j])), [data]);
  const employeesById = useMemo(() => new Map((data?.employees ?? []).map((e) => [e.id, e])), [data]);
  const clientsById = useMemo(() => new Map((data?.clients ?? []).map((c) => [c.id, c])), [data]);
  // A job's colour is inherited from its linked client — jobs with no
  // client (or a client that's since been deleted) fall back to a neutral
  // tint rather than showing as blank/undefined everywhere.
  const jobColorFor = (job: Job | undefined) =>
    (job?.client_id != null ? clientsById.get(job.client_id)?.color : undefined) ?? NO_CLIENT_COLOR;

  const jobVisible = (job: Job) => {
    if (!statusFilter.includes(job.status)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const clientName = job.client_id != null ? clientsById.get(job.client_id)?.name ?? '' : '';
      const haystack = `${job.name} ${job.code ?? ''} ${clientName}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  };

  const visibleAssignments = useMemo(() => {
    if (!data) return [];
    return data.assignments.filter((a) => {
      const job = jobsById.get(a.job_id!);
      if (!job) return false;
      return jobVisible(job);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, jobsById, statusFilter, search]);

  // Capacity overflow depends only on the raw data (every job/phase/
  // assignment, not whatever the user currently has searched/filtered
  // to) — a filtered-out job's demand on real headcount doesn't go away
  // just because it's hidden from view right now.
  const capacityOverflowItems = useMemo(() => (data ? buildCapacityOverflowItems(data) : []), [data]);

  const { groups, items } = useMemo(() => {
    if (!data) return { groups: [] as TLGroup[], items: [] as TLItem[] };

    const dateBackgroundItems = [...buildDateBackgroundItems(), ...capacityOverflowItems];

    if (groupMode === 'employee') {
      const groups: TLGroup[] = data.employees
        .filter((e) => e.active)
        .map((e, idx) => ({
          id: `emp-${e.id}`,
          content: `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${e.color};margin-right:8px;"></span><span style="font-size:14px;">${escapeHtml(e.name)}</span>`,
          className: idx % 2 === 1 ? 'tl-row-alt' : undefined,
        }));

      const items: TLItem[] = visibleAssignments.map((a) => {
        const job = jobsById.get(a.job_id!);
        const label = `${job ? escapeHtml(job.name) : ''} — ${a.phase_name ? escapeHtml(a.phase_name) : ''}`;
        const item = buildItem(a, `emp-${a.employee_id}`, label, job, jobColorFor(job));
        item.className += ' staff-bar';
        return item;
      });

      return { groups, items: [...dateBackgroundItems, ...items] };
    }

    const groups: TLGroup[] = [];
    const items: TLItem[] = [...dateBackgroundItems];

    let jobIndex = 0;
    for (const job of data.jobs) {
      if (!jobVisible(job)) continue;
      // Band the whole job — its header row and every phase row — as one
      // unit, alternating per job, so adjacent jobs stay easy to tell apart
      // without fighting the existing header-vs-phase shading.
      const altClass = jobIndex % 2 === 1 ? ' tl-row-alt' : '';
      jobIndex++;
      const jobPhases = data.phases.filter((p) => p.job_id === job.id);
      // Peak concurrent actual staff across the job's timeline (distinct
      // employees actually working on the same day, maxed over every
      // day) — not a flat distinct count across the whole job, which
      // overstates things whenever different people work non-overlapping
      // phases.
      const jobStaffCount = computeJobPeakActualStaff(job.id, jobPhases, visibleAssignments);
      // Peak estimated need across the job's timeline (estimates for
      // phases active on the same day, maxed over every day) — kept
      // separate from jobStaffCount (actual assignments) rather than
      // combined, and not a flat sum of every phase's estimate, which
      // overstates things whenever phases don't all run at once.
      const jobEstimatedStaff = computeJobPeakEstimatedStaff(jobPhases);
      const jobColor = jobColorFor(job);
      const client = job.client_id != null ? clientsById.get(job.client_id) : undefined;

      // Match the Jobs page's own list styling: 10px dot, standard 13px bold
      // name on line one (matching phase-name's own size); 12px dim meta
      // line (client/status/code/probability) underneath.
      const jobSwatch = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${jobColor};margin-right:8px;"></span>`;
      // font-weight:400 is explicit, not just "not bold" — .vis-nesting-group
      // (index.css) sets font-weight:600 on the whole label, which this
      // pill sits inside and would otherwise inherit.
      const clientPill = `<span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:0.02em;background:${jobColor};color:#fff;">${client ? escapeHtml(client.name) : 'No client set'}</span>`;
      const showCode = job.status !== 'pipeline' && job.status !== 'quoted' && job.code;
      const showProbability = (job.status === 'pipeline' || job.status === 'quoted') && job.probability != null;
      const jobMetaLine = `${clientPill} · ${JOB_STATUS_LABELS[job.status]}${showCode ? ` · ${escapeHtml(job.code ?? '')}` : ''}${showProbability ? ` · ${job.probability}%` : ''}`;
      // font-weight:400 is explicit, not just "not bold" — .vis-nesting-group
      // (index.css) sets font-weight:600 on the whole label, which a plain
      // span would otherwise inherit.
      const jobContent = `${jobSwatch}<span style="font-size:13px;font-weight:400;">${escapeHtml(job.name)}</span><div class="tl-job-meta" style="font-size:12px;color:var(--text-dim);margin-top:4px;">${jobMetaLine}</div>`;

      groups.push({
        id: `job-${job.id}`,
        content: jobContent,
        nestedGroups: jobPhases.map((p) => `phase-${p.id}`),
        className: `tl-job-group${altClass}`,
        style: `--job-color: ${jobColor}`,
        // Re-applied on every rebuild (search, status filter, a moved
        // assignment, etc. all rebuild this array) so an incidental
        // recompute doesn't quietly re-expand whatever the user collapsed.
        showNested: !collapsedJobIds.includes(job.id),
      });
      for (const phase of jobPhases) {
        const phaseStaffCount = new Set(
          visibleAssignments.filter((a) => a.phase_id === phase.id).map((a) => a.employee_id),
        ).size;
        const phaseMetaLine = `${formatShortDate(phase.start_date)} – ${formatShortDate(phase.end_date)}${phaseStaffCount ? ` · ${phaseStaffCount} staff` : ''}`;
        const phaseContent = `<div class="tl-phase-title-row"><span class="tl-phase-index">${phase.sequence}</span><strong class="tl-phase-name">${escapeHtml(phase.name)}</strong></div><div class="tl-phase-meta">${phaseMetaLine}</div>`;
        groups.push({ id: `phase-${phase.id}`, content: phaseContent, className: `tl-phase-group${altClass}`, style: `--job-color: ${jobColor}` });

        // Show any estimate as its own placeholder bar alongside whatever
        // real staff bars this phase already has.
        if (phase.estimated_staff) {
          items.push({
            id: `phase-estimate-${phase.id}`,
            group: `phase-${phase.id}`,
            content: `~${phase.estimated_staff} staff (est.)`,
            start: parseISODateLocal(phase.start_date),
            end: parseISODateLocal(isoDatePlusOne(phase.end_date)),
            className: 'tl-item estimate-bar',
            title: `${phase.name} · ~${phase.estimated_staff} staff estimated · ${formatShortDate(phase.start_date)} – ${formatShortDate(phase.end_date)}`,
            style: `--job-color: ${jobColor}`,
            editable: false,
          });
        }
      }

      // A consolidated bar on the job's own (parent) row, spanning every phase.
      // This stays visible even when the job's phase rows are collapsed.
      if (jobPhases.length > 0) {
        const minStart = jobPhases.reduce((min, p) => (p.start_date < min ? p.start_date : min), jobPhases[0].start_date);
        const maxEnd = jobPhases.reduce((max, p) => (p.end_date > max ? p.end_date : max), jobPhases[0].end_date);

        const classes = ['tl-item', 'job-summary'];
        if (TENTATIVE_STATUSES.has(job.status)) classes.push('tentative');
        classes.push(`status-${job.status}`);

        items.push({
          id: `job-summary-${job.id}`,
          group: `job-${job.id}`,
          content: `${jobPhases.length} phase${jobPhases.length === 1 ? '' : 's'}${jobStaffCount ? ` · ${jobStaffCount} staff` : ''}${jobEstimatedStaff ? ` · ~${jobEstimatedStaff} staff (est.)` : ''}`,
          start: parseISODateLocal(minStart),
          end: parseISODateLocal(isoDatePlusOne(maxEnd)),
          className: classes.join(' '),
          title: `${job.name} · ${formatShortDate(minStart)} – ${formatShortDate(maxEnd)}`,
          style: `--job-color: ${jobColor}`,
          editable: false,
        });
      }
    }

    for (const a of visibleAssignments) {
      const employee = employeesById.get(a.employee_id);
      const job = jobsById.get(a.job_id!);
      // Colour by employee, not job — the job's colour already carries the
      // phase rows and summary bar, so tinting staff bars by employee is
      // what lets you tell who's on a phase without opening it.
      const item = buildItem(a, `phase-${a.phase_id}`, employee ? escapeHtml(employee.name) : '', job, employee?.color ?? jobColorFor(job));
      item.className += ' staff-bar';
      items.push(item);
    }

    return { groups, items };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, groupMode, visibleAssignments, jobsById, employeesById, statusFilter, search, capacityOverflowItems, collapsedJobIds]);

  const applyPreset = (p: ZoomPreset) => {
    setPreset(p);
    setWindow(presetWindow(p, centerRef.current));
  };

  const goToday = () => {
    centerRef.current = new Date();
    setWindow(presetWindow(preset, centerRef.current));
  };

  const handleWindowChange = (start: Date, end: Date) => {
    centerRef.current = new Date((start.getTime() + end.getTime()) / 2);
    savePersistedView({ groupMode, preset, statusFilter, start: start.toISOString(), end: end.toISOString() });
  };

  // Persist immediately when a toggle changes, without waiting for the
  // timeline to also report a range change.
  useEffect(() => {
    if (!window) return;
    savePersistedView({ groupMode, preset, statusFilter, start: window.start.toISOString(), end: window.end.toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupMode, preset, statusFilter]);

  useEffect(() => {
    saveCollapsedJobIds(collapsedJobIds);
  }, [collapsedJobIds]);

  // vis-timeline reports collapse state as group ids ("job-4"), and reports
  // it whether a job's own label was clicked or collapseAllGroups/
  // expandAllGroups fired it — both go through the same internal toggle.
  // Only replace the array (a new reference feeds back into the groups
  // useMemo below) when the actual set of ids changed, since this also
  // fires — redundantly, but harmlessly if guarded — as a side effect of
  // that same useMemo re-rendering the DataSet with the current state.
  const handleNestingStateChange = (collapsedGroupIds: string[]) => {
    const jobIds = collapsedGroupIds
      .filter((id) => id.startsWith('job-'))
      .map((id) => Number(id.replace('job-', '')));
    setCollapsedJobIds((prev) => (sameIds(prev, jobIds) ? prev : jobIds));
  };

  const handleItemDoubleClick = (itemId: number | string) => {
    if (typeof itemId === 'string') {
      if (itemId.startsWith('job-summary-')) {
        const jobId = Number(itemId.replace('job-summary-', ''));
        const job = data?.jobs.find((j) => j.id === jobId);
        if (job) setEditingJob(job);
      }
      return;
    }
    const assignment = data?.assignments.find((a) => a.id === itemId);
    if (assignment) setEditing(assignment);
  };

  const handleLabelDoubleClick = (groupId: string) => {
    if (groupId.startsWith('job-')) {
      const jobId = Number(groupId.replace('job-', ''));
      const job = data?.jobs.find((j) => j.id === jobId);
      if (job) setEditingJob(job);
    } else if (groupId.startsWith('phase-')) {
      const phaseId = Number(groupId.replace('phase-', ''));
      const phase = data?.phases.find((p) => p.id === phaseId);
      if (phase) setEditingPhase(phase);
    } else if (groupId.startsWith('emp-')) {
      const employeeId = Number(groupId.replace('emp-', ''));
      const employee = data?.employees.find((e) => e.id === employeeId);
      if (employee) setEditingEmployee(employee);
    }
  };

  const handleEmptyDoubleClick = (groupId: string, time: Date) => {
    if (isReadOnly) return;
    const date = toISODate(time);
    if (groupId.startsWith('emp-')) {
      setCreating({ employeeId: Number(groupId.replace('emp-', '')), date });
    } else if (groupId.startsWith('phase-')) {
      const phaseId = Number(groupId.replace('phase-', ''));
      const phase = data?.phases.find((p) => p.id === phaseId);
      setCreating({ jobId: phase?.job_id, phaseId, date });
    } else if (groupId.startsWith('job-')) {
      setCreating({ jobId: Number(groupId.replace('job-', '')), date });
    } else {
      setCreating({ date });
    }
  };

  const handleItemMoved = async (itemId: number | string, start: Date, end: Date, groupId: string) => {
    if (typeof itemId === 'string') return; // job summary bar — not draggable
    const assignment = data?.assignments.find((a) => a.id === itemId);
    if (!assignment) return;
    const endInclusive = toISODate(addDays(end, -1));
    const patch: Partial<Assignment> = {
      start_date: toISODate(start),
      end_date: endInclusive,
    };
    if (groupMode === 'employee' && groupId.startsWith('emp-')) {
      patch.employee_id = Number(groupId.replace('emp-', ''));
    } else if (groupMode === 'job' && groupId.startsWith('phase-')) {
      patch.phase_id = Number(groupId.replace('phase-', ''));
    }
    try {
      await api.updateAssignment(itemId, patch);
    } finally {
      // Always resync from the server, even on failure — otherwise a
      // rejected save leaves the bar sitting at its optimistic (wrong)
      // position with no visible indication anything went wrong.
      load();
    }
  };

  if (!data) {
    return <div style={{ padding: 20 }}>Loading…</div>;
  }

  const activeEmployees = data.employees.filter((e) => e.active);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        className="toolbar-compact"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '6px 20px',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        <div className="toolbar-group">
          {(['quarter', 'month', 'week', 'day'] as ZoomPreset[]).map((p) => (
            <button key={p} className="btn" onClick={() => applyPreset(p)} style={{ background: preset === p ? 'var(--accent)' : undefined, borderColor: preset === p ? 'var(--accent)' : undefined }}>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <button className="btn" onClick={goToday}>
          Today
        </button>

        <div className="toolbar-group">
          <button
            className="btn"
            onClick={() => setGroupMode('employee')}
            style={{ background: groupMode === 'employee' ? 'var(--accent)' : undefined, borderColor: groupMode === 'employee' ? 'var(--accent)' : undefined }}
          >
            By Employee
          </button>
          <button
            className="btn"
            onClick={() => setGroupMode('job')}
            style={{ background: groupMode === 'job' ? 'var(--accent)' : undefined, borderColor: groupMode === 'job' ? 'var(--accent)' : undefined }}
          >
            By Job
          </button>
        </div>

        <input
          type="text"
          placeholder="Search job name, code, client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 220 }}
        />

        <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} />

        {!isReadOnly && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating({})}>
            + Add Assignment
          </button>
        )}
      </div>

      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)' }} className="legend">
        <span>
          <span className="legend-swatch" style={{ background: 'transparent', border: '1px dashed #6b7690' }} />
          Pipeline / Quoted
        </span>
        <span>
          <span className="legend-swatch" style={{ background: 'transparent', boxShadow: '0 0 0 2px var(--danger)' }} />
          Employee over allocated
        </span>
        <span>
          <span className="legend-swatch" style={{ background: 'rgba(250, 176, 5, 0.6)' }} />
          Estimate exceeds headcount
        </span>
        <span style={{ marginLeft: 'auto' }}>Double-click an empty slot to add · double-click a bar to edit · drag to reschedule</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <TimelineView
          // Force a fresh vis-timeline instance on mode switches — it
          // caches each row's measured height and, empirically, doesn't
          // always recompute it correctly for every row when switching
          // between flat (employee) and nested (job) grouping. A full
          // remount guarantees every row gets measured from scratch.
          key={groupMode}
          ref={timelineViewRef}
          groups={groups}
          items={items}
          window={window}
          onWindowChange={handleWindowChange}
          onItemDoubleClick={handleItemDoubleClick}
          onEmptyDoubleClick={handleEmptyDoubleClick}
          onLabelDoubleClick={handleLabelDoubleClick}
          onItemMoved={handleItemMoved}
          onNestingStateChange={handleNestingStateChange}
          readOnly={isReadOnly}
        />
        {groupMode === 'job' && (
          // Sits in the otherwise-dead corner above the label column and to
          // the left of the time axis — an absolutely positioned sibling
          // rather than anything injected into vis-timeline's own DOM,
          // which it fully owns and redraws on every data change.
          <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 1, display: 'flex', gap: 4 }}>
            <button
              className="btn"
              aria-label="Collapse all jobs"
              title="Collapse all jobs"
              style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => timelineViewRef.current?.collapseAllGroups()}
            >
              {/* Two chevrons pointing up/together — rows collapsing away.
                  Coordinates are the standard Lucide "chevrons-up" glyph:
                  its vertical extent (y 6 to 18) is already centred on a
                  24x24 viewBox, unlike the ad hoc points tried earlier. */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 11l5-5 5 5" />
                <path d="M7 18l5-5 5 5" />
              </svg>
            </button>
            <button
              className="btn"
              aria-label="Expand all jobs"
              title="Expand all jobs"
              style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => timelineViewRef.current?.expandAllGroups()}
            >
              {/* Two chevrons pointing down/apart — rows opening up. Same
                  centred-on-24x24 basis as the collapse icon above. */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 6l5 5 5-5" />
                <path d="M7 13l5 5 5-5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {editing && (
        <AssignmentModal
          employees={activeEmployees}
          jobs={data.jobs}
          phases={data.phases}
          assignment={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await api.updateAssignment(editing.id, patch);
            load();
          }}
          onDelete={async (id) => {
            await api.deleteAssignment(id);
            load();
          }}
          readOnly={isReadOnly}
        />
      )}
      {creating && (
        <AssignmentModal
          employees={activeEmployees}
          jobs={data.jobs}
          phases={data.phases}
          assignment={null}
          defaultEmployeeId={creating.employeeId}
          defaultJobId={creating.jobId}
          defaultPhaseId={creating.phaseId}
          defaultDate={creating.date}
          onClose={() => setCreating(null)}
          onSave={async (patch) => {
            await api.createAssignment(patch);
            load();
          }}
        />
      )}
      {editingJob && (
        <JobModal
          job={editingJob}
          clients={data.clients}
          employees={activeEmployees}
          onClose={() => setEditingJob(null)}
          onSave={async (patch) => {
            await api.updateJob(editingJob.id, patch);
            load();
          }}
          onDelete={async (id) => {
            await api.deleteJob(id);
            setEditingJob(null);
            load();
          }}
          readOnly={isReadOnly}
        />
      )}
      {editingPhase && (
        <PhaseModal
          phase={editingPhase}
          defaultSequence={editingPhase.sequence}
          onClose={() => setEditingPhase(null)}
          onSave={async (patch) => {
            await api.updatePhase(editingPhase.id, patch);
            load();
          }}
          onDelete={async (id) => {
            await api.deletePhase(id);
            setEditingPhase(null);
            load();
          }}
          readOnly={isReadOnly}
        />
      )}
      {editingEmployee && (
        <EmployeeModal
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSave={async (patch) => {
            await api.updateEmployee(editingEmployee.id, patch);
            load();
          }}
          onDelete={async (id) => {
            await api.deleteEmployee(id);
            setEditingEmployee(null);
            load();
          }}
          readOnly={isReadOnly}
        />
      )}
    </div>
  );
}

// Peak actual staff for one job: for each day across its phases' combined
// span, the count of distinct employees actually assigned that day, then
// the max of that across every day. Not a flat distinct count across the
// whole job — two people working non-overlapping phases would otherwise
// count as "2 staff" even though only one was ever on site at a time.
function computeJobPeakActualStaff(jobId: number, jobPhases: Phase[], assignments: Assignment[]): number {
  if (jobPhases.length === 0) return 0;

  const minStart = jobPhases.reduce((min, p) => (p.start_date < min ? p.start_date : min), jobPhases[0].start_date);
  const maxEnd = jobPhases.reduce((max, p) => (p.end_date > max ? p.end_date : max), jobPhases[0].end_date);

  let peak = 0;
  for (let d = parseISODateLocal(minStart); d <= parseISODateLocal(maxEnd); d = addDays(d, 1)) {
    const iso = toISODate(d);
    const realCount = new Set(
      assignments.filter((a) => a.job_id === jobId && a.start_date <= iso && a.end_date >= iso).map((a) => a.employee_id),
    ).size;
    peak = Math.max(peak, realCount);
  }
  return peak;
}

// Peak estimated staff need for one job: for each day across its phases'
// combined span, the sum of estimates for phases active that day, then
// the max of that across every day. Deliberately excludes real
// assignments (shown separately as jobStaffCount) and isn't a flat sum of
// every phase's estimate — phases running sequentially rather than at
// once would otherwise overstate demand.
function computeJobPeakEstimatedStaff(jobPhases: Phase[]): number {
  if (!jobPhases.some((p) => p.estimated_staff)) return 0;

  const minStart = jobPhases.reduce((min, p) => (p.start_date < min ? p.start_date : min), jobPhases[0].start_date);
  const maxEnd = jobPhases.reduce((max, p) => (p.end_date > max ? p.end_date : max), jobPhases[0].end_date);

  let peak = 0;
  for (let d = parseISODateLocal(minStart); d <= parseISODateLocal(maxEnd); d = addDays(d, 1)) {
    const iso = toISODate(d);
    const estimatedCount = jobPhases
      .filter((p) => p.start_date <= iso && p.end_date >= iso)
      .reduce((sum, p) => sum + (p.estimated_staff ?? 0), 0);
    peak = Math.max(peak, estimatedCount);
  }
  return peak;
}

function buildItem(a: Assignment, group: string, content: string, job: Job | undefined, color: string): TLItem {
  const classes = ['tl-item'];
  if (job && TENTATIVE_STATUSES.has(job.status)) classes.push('tentative');
  if (job) classes.push(`status-${job.status}`);
  if (a.conflict) classes.push('conflict');

  return {
    id: a.id,
    group,
    content,
    start: parseISODateLocal(a.start_date),
    end: parseISODateLocal(isoDatePlusOne(a.end_date)),
    className: classes.join(' '),
    title: `${content} · ${formatShortDate(a.start_date)} – ${formatShortDate(a.end_date)}${a.allocation_pct < 100 ? ` · ${a.allocation_pct}%` : ''}${a.conflict ? ' · OVER-ALLOCATED' : ''}`,
    style: `--job-color: ${color}`,
  };
}

// Covers a fixed ~2.5 year window around today rather than the current
// pan/zoom window, so scrolling sideways doesn't run out of shading.
function getScheduleBackgroundRange(): { rangeStart: Date; rangeEnd: Date } {
  return {
    rangeStart: addMonths(startOfMonth(new Date()), -6),
    rangeEnd: addMonths(startOfMonth(new Date()), 24),
  };
}

// Weekend/holiday shading, as full-height vis-timeline "background" items
// (no group — they render behind every row rather than in one).
function buildDateBackgroundItems(): TLItem[] {
  const { rangeStart, rangeEnd } = getScheduleBackgroundRange();
  const items: TLItem[] = [];

  // Merge each Saturday+Sunday into a single 2-day span rather than one
  // item per day.
  for (let d = new Date(rangeStart); d < rangeEnd; d = addDays(d, d.getDay() === 6 ? 7 : 1)) {
    if (d.getDay() !== 6) continue;
    const start = new Date(d);
    items.push({
      id: `weekend-${toISODate(start)}`,
      content: '',
      start,
      end: addDays(start, 2),
      type: 'background',
      className: 'tl-weekend',
    });
  }

  for (const holiday of nzHolidaysInRange(rangeStart, rangeEnd)) {
    items.push({
      id: `holiday-${toISODate(holiday.date)}`,
      content: '',
      start: holiday.date,
      end: addDays(holiday.date, 1),
      type: 'background',
      className: 'tl-holiday',
      title: holiday.name,
    });
  }

  return items;
}

// Flags any day where demand for staff exceeds total active headcount.
// Demand = every real assignee that day (each employee counted once,
// globally, regardless of allocation%) plus, per phase with an estimate,
// only the *shortfall* above that phase's own real allocation — an
// estimate of 3 with 2 people already for-real assigned to that phase
// contributes 1 more, not 3 more (the 2 are already in the real count).
// Answers "could we actually staff this if every estimate panned out,"
// not just "is any one person over-booked."
function buildCapacityOverflowItems(data: TimelinePayload): TLItem[] {
  const totalEmployees = data.employees.filter((e) => e.active).length;
  if (totalEmployees === 0) return [];

  const { rangeStart, rangeEnd } = getScheduleBackgroundRange();
  const estimatedPhases = data.phases.filter((p) => p.estimated_staff);

  const overflowDays: string[] = [];
  for (let d = new Date(rangeStart); d < rangeEnd; d = addDays(d, 1)) {
    const iso = toISODate(d);
    const activeAssignments = data.assignments.filter((a) => a.start_date <= iso && a.end_date >= iso);
    const realCount = new Set(activeAssignments.map((a) => a.employee_id)).size;

    let extraEstimated = 0;
    for (const phase of estimatedPhases) {
      if (phase.start_date > iso || phase.end_date < iso) continue;
      const phaseActualCount = new Set(
        activeAssignments.filter((a) => a.phase_id === phase.id).map((a) => a.employee_id),
      ).size;
      extraEstimated += Math.max(0, (phase.estimated_staff ?? 0) - phaseActualCount);
    }

    if (realCount + extraEstimated > totalEmployees) overflowDays.push(iso);
  }

  // Merge consecutive overflow days into single spans rather than one
  // item per day.
  const items: TLItem[] = [];
  let i = 0;
  while (i < overflowDays.length) {
    let j = i;
    while (
      j + 1 < overflowDays.length &&
      toISODate(addDays(parseISODateLocal(overflowDays[j]), 1)) === overflowDays[j + 1]
    ) {
      j++;
    }
    items.push({
      id: `overcapacity-${overflowDays[i]}`,
      content: '',
      start: parseISODateLocal(overflowDays[i]),
      end: addDays(parseISODateLocal(overflowDays[j]), 1),
      type: 'background',
      className: 'tl-overcapacity',
      title: 'Estimated + assigned staff exceed total headcount on this date',
    });
    i = j + 1;
  }

  return items;
}
