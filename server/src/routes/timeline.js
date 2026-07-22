import { Router } from 'express';
import db from '../db/index.js';
import { computeConflictIds } from '../lib/conflicts.js';

const router = Router();

// Combined payload for the schedule/Gantt view: everything needed to render
// items grouped by employee or by job, with job/phase context on each assignment.
router.get('/', (req, res) => {
  const employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
  const clients = db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE').all();
  // Client first, then job code, with either missing sorted to the end —
  // matches the Jobs list ordering (see routes/jobs.js) so By Job groups
  // appear in the same order on both screens.
  const jobs = db
    .prepare(
      `SELECT jobs.* FROM jobs
       LEFT JOIN clients ON clients.id = jobs.client_id
       ORDER BY clients.name IS NULL, clients.name COLLATE NOCASE,
                jobs.code IS NULL, jobs.code COLLATE NOCASE`
    )
    .all();
  const phases = db.prepare('SELECT * FROM phases ORDER BY sequence, start_date').all();
  const assignments = db
    .prepare(
      `SELECT a.*, p.job_id AS job_id, p.name AS phase_name, p.start_date AS phase_start, p.end_date AS phase_end
       FROM assignments a
       JOIN phases p ON p.id = a.phase_id
       ORDER BY a.start_date`
    )
    .all();
  const leave = db.prepare('SELECT * FROM leave_periods ORDER BY start_date').all();
  const nonBillable = db.prepare('SELECT * FROM non_billable_periods ORDER BY start_date').all();

  // A completed phase's booking no longer competes for the employee's
  // capacity — same reasoning as excluding it from the Schedule itself —
  // so it's left out of the conflict pool entirely, both as something that
  // can itself be flagged and as competition for anyone else's allocation.
  const completedPhaseIds = new Set(db.prepare('SELECT id FROM phases WHERE complete = 1').all().map((p) => p.id));
  const conflictCandidates = assignments.filter((a) => !completedPhaseIds.has(a.phase_id));
  const { assignmentConflictIds, leaveConflictIds, nonBillableConflictIds } = computeConflictIds(conflictCandidates, leave, nonBillable);
  const assignmentsWithConflict = assignments.map((a) => ({ ...a, conflict: assignmentConflictIds.has(a.id) }));
  const leaveWithConflict = leave.map((l) => ({ ...l, conflict: leaveConflictIds.has(l.id) }));
  const nonBillableWithConflict = nonBillable.map((n) => ({ ...n, conflict: nonBillableConflictIds.has(n.id) }));

  res.json({
    employees,
    jobs,
    phases,
    assignments: assignmentsWithConflict,
    clients,
    leave: leaveWithConflict,
    nonBillable: nonBillableWithConflict,
  });
});

export default router;
