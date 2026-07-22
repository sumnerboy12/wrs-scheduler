// Flags assignments/non-billable blocks where an employee is booked over
// 100% allocation on overlapping dates — a job and a training block stack
// against the same capacity the same way two jobs would — or booked/
// non-billable while also marked on leave for an overlapping date. Each
// record type has its own id space, so three separate id sets come back
// rather than one shared set.
export function computeConflictIds(assignments, leavePeriods = [], nonBillablePeriods = []) {
  const assignmentConflictIds = new Set();
  const leaveConflictIds = new Set();
  const nonBillableConflictIds = new Set();

  // Assignments and non-billable blocks share the same 100%-of-day
  // capacity pool, so every pairwise overlap check below runs across
  // both together, not assignments alone.
  const combined = [
    ...assignments.map((a) => ({ ...a, kind: 'assignment' })),
    ...nonBillablePeriods.map((n) => ({ ...n, kind: 'nonBillable' })),
  ];
  const flag = (item) => (item.kind === 'assignment' ? assignmentConflictIds.add(item.id) : nonBillableConflictIds.add(item.id));

  const byEmployee = new Map();
  for (const item of combined) {
    if (!byEmployee.has(item.employee_id)) byEmployee.set(item.employee_id, []);
    byEmployee.get(item.employee_id).push(item);
  }

  for (const list of byEmployee.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const overlaps = a.start_date <= b.end_date && b.start_date <= a.end_date;
        if (overlaps && a.allocation_pct + b.allocation_pct > 100) {
          flag(a);
          flag(b);
        }
      }
    }
  }

  const leaveByEmployee = new Map();
  for (const l of leavePeriods) {
    if (!leaveByEmployee.has(l.employee_id)) leaveByEmployee.set(l.employee_id, []);
    leaveByEmployee.get(l.employee_id).push(l);
  }

  for (const item of combined) {
    for (const l of leaveByEmployee.get(item.employee_id) ?? []) {
      const overlaps = item.start_date <= l.end_date && l.start_date <= item.end_date;
      if (overlaps) {
        flag(item);
        leaveConflictIds.add(l.id);
      }
    }
  }

  return { assignmentConflictIds, leaveConflictIds, nonBillableConflictIds };
}
