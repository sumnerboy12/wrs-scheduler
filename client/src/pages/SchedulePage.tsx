import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Assignment, Job, TimelinePayload } from '../types';
import { JOB_STATUS_LABELS } from '../types';
import TimelineView, { type TLGroup, type TLItem } from '../components/TimelineView';
import AssignmentModal from '../components/AssignmentModal';
import { addDays, isoDatePlusOne, parseISODateLocal, presetWindow, toISODate, type ZoomPreset } from '../lib/dates';

type GroupMode = 'employee' | 'job';

const TENTATIVE_STATUSES = new Set(['pipeline', 'quoted']);

const VIEW_STORAGE_KEY = 'wrs-schedule-view';

interface PersistedView {
  groupMode: GroupMode;
  preset: ZoomPreset;
  showClosed: boolean;
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
  const [window, setWindow] = useState<{ start: Date; end: Date } | null>(() => {
    const persisted = loadPersistedView();
    if (persisted) return { start: new Date(persisted.start), end: new Date(persisted.end) };
    return presetWindow('month', new Date());
  });
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [creating, setCreating] = useState<{ employeeId?: number; date?: string } | null>(null);

  const centerRef = useRef(window ? new Date((window.start.getTime() + window.end.getTime()) / 2) : new Date());

  const load = () => api.getTimeline().then(setData);
  useEffect(() => {
    load();
  }, []);

  const jobsById = useMemo(() => new Map((data?.jobs ?? []).map((j) => [j.id, j])), [data]);
  const employeesById = useMemo(() => new Map((data?.employees ?? []).map((e) => [e.id, e])), [data]);

  const visibleAssignments = useMemo(() => {
    if (!data) return [];
    return data.assignments.filter((a) => {
      const job = jobsById.get(a.job_id!);
      if (!job) return false;
      if (!showClosed && (job.status === 'complete' || job.status === 'lost')) return false;
      return true;
    });
  }, [data, jobsById, showClosed]);

  const { groups, items } = useMemo(() => {
    if (!data) return { groups: [] as TLGroup[], items: [] as TLItem[] };

    if (groupMode === 'employee') {
      const groups: TLGroup[] = data.employees
        .filter((e) => e.active)
        .map((e, idx) => ({
          id: `emp-${e.id}`,
          content: `${e.name}${e.role ? `<br><small style="color:var(--text-dim)">${e.role}</small>` : ''}`,
          className: idx % 2 === 1 ? 'tl-row-alt' : undefined,
        }));

      const items: TLItem[] = visibleAssignments.map((a) => {
        const job = jobsById.get(a.job_id!);
        const item = buildItem(a, `emp-${a.employee_id}`, `${job?.name ?? ''} — ${a.phase_name}`, job);
        item.className += ' staff-bar';
        return item;
      });

      return { groups, items };
    }

    const groups: TLGroup[] = [];
    const items: TLItem[] = [];

    let jobIndex = 0;
    for (const job of data.jobs) {
      if (!showClosed && (job.status === 'complete' || job.status === 'lost')) continue;
      // Band the whole job — its header row and every phase row — as one
      // unit, alternating per job, so adjacent jobs stay easy to tell apart
      // without fighting the existing header-vs-phase shading.
      const altClass = jobIndex % 2 === 1 ? ' tl-row-alt' : '';
      jobIndex++;
      const jobPhases = data.phases.filter((p) => p.job_id === job.id);
      groups.push({
        id: `job-${job.id}`,
        content: `${job.name}<br><small style="color:var(--text-dim)">${JOB_STATUS_LABELS[job.status]}</small>`,
        nestedGroups: jobPhases.map((p) => `phase-${p.id}`),
        className: `tl-job-group${altClass}`,
        style: `--job-color: ${job.color}`,
      });
      for (const phase of jobPhases) {
        groups.push({ id: `phase-${phase.id}`, content: phase.name, className: `tl-phase-group${altClass}`, style: `--job-color: ${job.color}` });
      }

      // A consolidated bar on the job's own (parent) row, spanning every phase.
      // This stays visible even when the job's phase rows are collapsed.
      if (jobPhases.length > 0) {
        const minStart = jobPhases.reduce((min, p) => (p.start_date < min ? p.start_date : min), jobPhases[0].start_date);
        const maxEnd = jobPhases.reduce((max, p) => (p.end_date > max ? p.end_date : max), jobPhases[0].end_date);
        const staffCount = new Set(visibleAssignments.filter((a) => a.job_id === job.id).map((a) => a.employee_id)).size;

        const classes = ['tl-item', 'job-summary'];
        if (TENTATIVE_STATUSES.has(job.status)) classes.push('tentative');
        classes.push(`status-${job.status}`);

        items.push({
          id: `job-summary-${job.id}`,
          group: `job-${job.id}`,
          content: `${jobPhases.length} phase${jobPhases.length === 1 ? '' : 's'}${staffCount ? ` · ${staffCount} staff` : ''}`,
          start: parseISODateLocal(minStart),
          end: parseISODateLocal(isoDatePlusOne(maxEnd)),
          className: classes.join(' '),
          title: `${job.name} · ${minStart} – ${maxEnd}`,
          style: `--job-color: ${job.color}`,
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
      const item = buildItem(a, `phase-${a.phase_id}`, employee?.name ?? '', job, employee?.color);
      item.className += ' staff-bar';
      items.push(item);
    }

    return { groups, items };
  }, [data, groupMode, visibleAssignments, jobsById, employeesById, showClosed]);

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
    savePersistedView({ groupMode, preset, showClosed, start: start.toISOString(), end: end.toISOString() });
  };

  // Persist immediately when a toggle changes, without waiting for the
  // timeline to also report a range change.
  useEffect(() => {
    if (!window) return;
    savePersistedView({ groupMode, preset, showClosed, start: window.start.toISOString(), end: window.end.toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupMode, preset, showClosed]);

  const handleItemDoubleClick = (itemId: number | string) => {
    if (typeof itemId === 'string') return; // job summary bar — not an editable assignment
    const assignment = data?.assignments.find((a) => a.id === itemId);
    if (assignment) setEditing(assignment);
  };

  const handleEmptyDoubleClick = (groupId: string, time: Date) => {
    const date = toISODate(time);
    if (groupId.startsWith('emp-')) {
      setCreating({ employeeId: Number(groupId.replace('emp-', '')), date });
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

        <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} style={{ width: 'auto' }} />
          Show completed / lost jobs
        </label>

        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating({})}>
          + Add Assignment
        </button>
      </div>

      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)' }} className="legend">
        {Object.entries(JOB_STATUS_LABELS)
          .filter(([s]) => showClosed || (s !== 'complete' && s !== 'lost'))
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
          groups={groups}
          items={items}
          window={window}
          onWindowChange={handleWindowChange}
          onItemDoubleClick={handleItemDoubleClick}
          onEmptyDoubleClick={handleEmptyDoubleClick}
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
          defaultDate={creating.date}
          onClose={() => setCreating(null)}
          onSave={async (patch) => {
            await api.createAssignment(patch);
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
    title: `${content}${a.allocation_pct < 100 ? ` · ${a.allocation_pct}%` : ''}${a.conflict ? ' · OVER-ALLOCATED' : ''}`,
    style: `--job-color: ${color ?? job?.color ?? '#4f7cff'}`,
  };
}
