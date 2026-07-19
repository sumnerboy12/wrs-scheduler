import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Assignment, Job, Phase, TimelinePayload } from '../types';
import { JOB_STATUS_LABELS } from '../types';
import TimelineView, { type TLGroup, type TLItem } from '../components/TimelineView';
import AssignmentModal from '../components/AssignmentModal';
import JobModal from '../components/JobModal';
import PhaseModal from '../components/PhaseModal';
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

type GroupMode = 'employee' | 'job';

const TENTATIVE_STATUSES = new Set(['pipeline', 'quoted']);

const VIEW_STORAGE_KEY = 'wrs-schedule-view';

interface PersistedView {
  groupMode: GroupMode;
  preset: ZoomPreset;
  showClosed: boolean;
  compact: boolean;
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

export default function SchedulePage() {
  const [data, setData] = useState<TimelinePayload | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>(() => loadPersistedView()?.groupMode ?? 'employee');
  const [preset, setPreset] = useState<ZoomPreset>(() => loadPersistedView()?.preset ?? 'month');
  const [showClosed, setShowClosed] = useState(() => loadPersistedView()?.showClosed ?? false);
  const [compact, setCompact] = useState(() => loadPersistedView()?.compact ?? false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [window, setWindow] = useState<{ start: Date; end: Date } | null>(() => {
    const persisted = loadPersistedView();
    if (persisted) return { start: new Date(persisted.start), end: new Date(persisted.end) };
    return presetWindow('month', new Date());
  });
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [creating, setCreating] = useState<{ employeeId?: number; jobId?: number; phaseId?: number; date?: string } | null>(null);

  const centerRef = useRef(window ? new Date((window.start.getTime() + window.end.getTime()) / 2) : new Date());

  const load = () => api.getTimeline().then(setData);
  useEffect(() => {
    load();
  }, []);

  const jobsById = useMemo(() => new Map((data?.jobs ?? []).map((j) => [j.id, j])), [data]);
  const employeesById = useMemo(() => new Map((data?.employees ?? []).map((e) => [e.id, e])), [data]);

  // A specific status pick is authoritative (shows that status regardless
  // of the coarse "show completed/lost" toggle); "All statuses" falls back
  // to the existing showClosed behaviour.
  const jobVisible = (job: Job) => {
    if (statusFilter !== 'all') {
      if (job.status !== statusFilter) return false;
    } else if (!showClosed && (job.status === 'complete' || job.status === 'lost')) {
      return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = `${job.name} ${job.code ?? ''} ${job.client_name ?? ''}`.toLowerCase();
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
  }, [data, jobsById, showClosed, statusFilter, search]);

  const { groups, items } = useMemo(() => {
    if (!data) return { groups: [] as TLGroup[], items: [] as TLItem[] };

    const dateBackgroundItems = buildDateBackgroundItems();

    if (groupMode === 'employee') {
      const groups: TLGroup[] = data.employees
        .filter((e) => e.active)
        .map((e, idx) => ({
          id: `emp-${e.id}`,
          content: `${escapeHtml(e.name)}${e.role ? `<br><small style="color:var(--text-dim)">${escapeHtml(e.role)}</small>` : ''}`,
          className: idx % 2 === 1 ? 'tl-row-alt' : undefined,
        }));

      const items: TLItem[] = visibleAssignments.map((a) => {
        const job = jobsById.get(a.job_id!);
        const label = `${job ? escapeHtml(job.name) : ''} — ${a.phase_name ? escapeHtml(a.phase_name) : ''}`;
        const item = buildItem(a, `emp-${a.employee_id}`, label, job);
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
      const jobStaffCount = new Set(visibleAssignments.filter((a) => a.job_id === job.id).map((a) => a.employee_id)).size;

      // Match the Jobs page's own list styling exactly: 10px dot, 12px dim
      // code, 14px bold name on line one; 12px dim meta line underneath.
      const jobSwatch = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${job.color};margin-right:8px;"></span>`;
      const jobCodePrefix = job.code ? `<span style="font-size:12px;color:var(--text-dim);">${escapeHtml(job.code)}</span> ` : '';
      const jobContent = compact
        ? `${jobSwatch}${jobCodePrefix}<strong style="font-size:13px;">${escapeHtml(job.name)}</strong>`
        : (() => {
            const jobStatusPill = `<span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.02em;background:${job.color};color:#fff;">${JOB_STATUS_LABELS[job.status]}</span>`;
            const jobMetaLine = `${jobStatusPill} · ${job.client_name ? escapeHtml(job.client_name) : 'No client set'}`;
            return `${jobSwatch}${jobCodePrefix}<strong style="font-size:14px;">${escapeHtml(job.name)}</strong><div style="font-size:12px;color:var(--text-dim);margin-top:4px;">${jobMetaLine}</div>`;
          })();

      groups.push({
        id: `job-${job.id}`,
        content: jobContent,
        nestedGroups: compact ? undefined : jobPhases.map((p) => `phase-${p.id}`),
        className: `tl-job-group${altClass}${compact ? ' tl-compact' : ''}`,
        style: `--job-color: ${job.color}`,
      });
      if (!compact) {
        for (const phase of jobPhases) {
          const phaseStaffCount = new Set(
            visibleAssignments.filter((a) => a.phase_id === phase.id).map((a) => a.employee_id),
          ).size;
          const phaseMetaLine = `${formatShortDate(phase.start_date)} – ${formatShortDate(phase.end_date)}${phaseStaffCount ? ` · ${phaseStaffCount} staff` : ''}`;
          const phaseContent = `<div class="tl-phase-title-row"><span class="tl-phase-index">${phase.sequence}</span><strong class="tl-phase-name">${escapeHtml(phase.name)}</strong></div><div class="tl-phase-meta">${phaseMetaLine}</div>`;
          groups.push({ id: `phase-${phase.id}`, content: phaseContent, className: `tl-phase-group${altClass}`, style: `--job-color: ${job.color}` });
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
        if (compact) classes.push('tl-compact');

        items.push({
          id: `job-summary-${job.id}`,
          group: `job-${job.id}`,
          content: `${jobPhases.length} phase${jobPhases.length === 1 ? '' : 's'}${jobStaffCount ? ` · ${jobStaffCount} staff` : ''}`,
          start: parseISODateLocal(minStart),
          end: parseISODateLocal(isoDatePlusOne(maxEnd)),
          className: classes.join(' '),
          title: `${job.name} · ${formatShortDate(minStart)} – ${formatShortDate(maxEnd)}`,
          style: `--job-color: ${job.color}`,
          editable: false,
        });
      }
    }

    if (!compact) {
      for (const a of visibleAssignments) {
        const employee = employeesById.get(a.employee_id);
        const job = jobsById.get(a.job_id!);
        // Colour by employee, not job — the job's colour already carries the
        // phase rows and summary bar, so tinting staff bars by employee is
        // what lets you tell who's on a phase without opening it.
        const item = buildItem(a, `phase-${a.phase_id}`, employee ? escapeHtml(employee.name) : '', job, employee?.color);
        item.className += ' staff-bar';
        items.push(item);
      }
    }

    return { groups, items };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, groupMode, visibleAssignments, jobsById, employeesById, showClosed, statusFilter, search, compact]);

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
    savePersistedView({ groupMode, preset, showClosed, compact, start: start.toISOString(), end: end.toISOString() });
  };

  // Persist immediately when a toggle changes, without waiting for the
  // timeline to also report a range change.
  useEffect(() => {
    if (!window) return;
    savePersistedView({ groupMode, preset, showClosed, compact, start: window.start.toISOString(), end: window.end.toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupMode, preset, showClosed, compact]);

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
    }
  };

  const handleEmptyDoubleClick = (groupId: string, time: Date) => {
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 20px',
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

        {groupMode === 'job' && (
          <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} style={{ width: 'auto' }} />
            Compact view
          </label>
        )}

        <input
          type="text"
          placeholder="Search job name, code, client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 220 }}
        />

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 160 }}>
          <option value="all">All statuses</option>
          {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            disabled={statusFilter !== 'all'}
            style={{ width: 'auto' }}
          />
          Show completed / lost jobs
        </label>

        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating({})}>
          + Add Assignment
        </button>
      </div>

      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)' }} className="legend">
        {Object.entries(JOB_STATUS_LABELS)
          .filter(([s]) => (statusFilter === 'all' ? showClosed || (s !== 'complete' && s !== 'lost') : s === statusFilter))
          .map(([status, label]) => (
            <span key={status}>
              <span
                className="legend-swatch"
                style={
                  TENTATIVE_STATUSES.has(status)
                    ? { background: 'repeating-linear-gradient(45deg, #6b7690, #6b7690 3px, transparent 3px, transparent 6px)', border: '1px dashed #6b7690' }
                    : { background: '#6b7690' }
                }
              />
              {label}
            </span>
          ))}
        <span>
          <span className="legend-swatch" style={{ background: 'transparent', boxShadow: '0 0 0 2px var(--danger)' }} />
          Over-allocated
        </span>
        <span style={{ marginLeft: 'auto' }}>Double-click an empty slot to add · double-click a bar to edit · drag to reschedule</span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <TimelineView
          // Force a fresh vis-timeline instance on mode switches — it
          // caches each row's measured height and, empirically, doesn't
          // always recompute it correctly for every row when only the
          // group content shrinks (e.g. leaving one row taller than the
          // rest after toggling into compact view). A full remount
          // guarantees every row gets measured from scratch.
          key={`${groupMode}-${compact}`}
          groups={groups}
          items={items}
          window={window}
          onWindowChange={handleWindowChange}
          onItemDoubleClick={handleItemDoubleClick}
          onEmptyDoubleClick={handleEmptyDoubleClick}
          onLabelDoubleClick={handleLabelDoubleClick}
          onItemMoved={handleItemMoved}
        />
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
        />
      )}
    </div>
  );
}

function buildItem(a: Assignment, group: string, content: string, job: Job | undefined, color?: string): TLItem {
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
    style: `--job-color: ${color ?? job?.color ?? '#4f7cff'}`,
  };
}

// Weekend/holiday shading, as full-height vis-timeline "background" items
// (no group — they render behind every row rather than in one). Covers a
// fixed ~2.5 year window around today rather than the current pan/zoom
// window, so scrolling sideways doesn't run out of shaded weekends.
function buildDateBackgroundItems(): TLItem[] {
  const rangeStart = addMonths(startOfMonth(new Date()), -6);
  const rangeEnd = addMonths(startOfMonth(new Date()), 24);
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
