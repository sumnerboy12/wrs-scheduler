// Flags assignments where an employee is booked over 100% allocation on overlapping dates.
export function computeConflictIds(assignments) {
  const conflictIds = new Set();
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
          conflictIds.add(a.id);
          conflictIds.add(b.id);
        }
      }
    }
  }

  return conflictIds;
}
