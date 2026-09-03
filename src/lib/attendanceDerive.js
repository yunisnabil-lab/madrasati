// Shared logic for turning raw per-period attendance_records rows into a
// single derived status per student per day. Mirrors the rule used on the
// student profile page: 3+ periods marked absent => the day counts as
// absent; lateness never affects the day-level status; a legacy row
// (period is null — includes admin/management "final" overrides) is used
// as-is for that day.

function deriveDayFromRows(rows) {
  const legacy = rows.find((r) => r.period == null);
  if (legacy) {
    return { status: legacy.status, absentCount: 0, lateCount: 0 };
  }
  const absentCount = rows.filter((r) => r.status === 'absent').length;
  const lateCount = rows.filter((r) => r.status === 'late').length;
  const status = absentCount >= 3 ? 'absent' : 'present';
  return { status, absentCount, lateCount };
}

// records: [{ student_id, date, status, period }]
// returns: Map<student_id, Map<date, { status, absentCount, lateCount }>>
export function deriveByStudentAndDate(records) {
  const byStudent = new Map();
  records.forEach((r) => {
    if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, new Map());
    const byDate = byStudent.get(r.student_id);
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  });

  const result = new Map();
  byStudent.forEach((byDate, studentId) => {
    const dayMap = new Map();
    byDate.forEach((rows, date) => { dayMap.set(date, deriveDayFromRows(rows)); });
    result.set(studentId, dayMap);
  });
  return result;
}
