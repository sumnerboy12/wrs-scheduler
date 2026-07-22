// Flags assignments where an employee is booked over 100% allocation on
// overlapping dates, or booked on a job while also marked on leave for an
// overlapping date — either way it's something a scheduler should notice.
// Assignments and leave periods are different record types with their own
// id spaces, so two separate id sets come back rather than one shared set.
export function computeConflictIds(assignments, leavePeriods = []) {
  const assignmentConflictIds = new Set();
  const leaveConflictIds = new Set();
  const byEmployee = new Map();

  for (const a of assignments) {
    if (!byEmployee.has(a.employee_id)) byEmployee.set(a.employee_id, []);
    byEmployee.get(a.employee_id).push(a);
  }

  for (const list of byEmployee.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const overlaps = a.start_date <= b.end_date && b.start_date <= a.end_date;
        if (overlaps && a.allocation_pct + b.allocation_pct > 100) {
          assignmentConflictIds.add(a.id);
          assignmentConflictIds.add(b.id);
        }
      }
    }
  }

  const leaveByEmployee = new Map();
  for (const l of leavePeriods) {
    if (!leaveByEmployee.has(l.employee_id)) leaveByEmployee.set(l.employee_id, []);
    leaveByEmployee.get(l.employee_id).push(l);
  }

  for (const a of assignments) {
    for (const l of leaveByEmployee.get(a.employee_id) ?? []) {
      const overlaps = a.start_date <= l.end_date && l.start_date <= a.end_date;
      if (overlaps) {
        assignmentConflictIds.add(a.id);
        leaveConflictIds.add(l.id);
      }
    }
  }

  return { assignmentConflictIds, leaveConflictIds };
}
