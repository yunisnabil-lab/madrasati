// Shared logic for turning raw per-period attendance_records rows into a
// single derived status per student per day.
//
// A school day has up to PERIODS_PER_DAY periods. The day counts as
// "present" when the student was marked present in at least
// PRESENT_THRESHOLD of those periods; otherwise the day counts as absent.
// A day with EXCUSED_THRESHOLD or more periods marked excused counts as
// excused instead (an authorized absence beats the present/absent count).
// Lateness is tracked separately (lateCount) and never changes the
// day-level status. A legacy row (period is null — includes
// admin/management "final" overrides) is used as-is for that day,
// bypassing the period count entirely.

export const PERIODS_PER_DAY = 8;
export const PRESENT_THRESHOLD = 5;
const EXCUSED_THRESHOLD = 3;

function deriveDayFromRows(rows) {
  const legacy = rows.find((r) => r.period == null);
  if (legacy) {
    return { status: legacy.status, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0, periods: {} };
  }
  const periods = {};
  rows.forEach((r) => { if (r.period != null) periods[r.period] = r.status; });
  const presentCount = rows.filter((r) => r.status === 'present').length;
  const absentCount = rows.filter((r) => r.status === 'absent').length;
  const lateCount = rows.filter((r) => r.status === 'late').length;
  const excusedCount = rows.filter((r) => r.status === 'excused').length;
  const status = excusedCount >= EXCUSED_THRESHOLD
    ? 'excused'
    : (presentCount >= PRESENT_THRESHOLD ? 'present' : 'absent');
  return { status, presentCount, absentCount, lateCount, excusedCount, periods };
}

// records: [{ student_id, date, status, period }]
// returns: Map<student_id, Map<date, { status, presentCount, absentCount, lateCount, excusedCount, periods }>>
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
