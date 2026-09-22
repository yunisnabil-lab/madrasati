// Shared logic for turning raw per-period attendance_records rows into a
// single derived status per student per day.
//
// A school day has up to PERIODS_PER_DAY periods, but not every period is
// necessarily recorded on a given day (a recorder may only get through one
// or two periods, or a class may not meet every period). The day-level
// status is decided ONLY from the periods that were actually recorded —
// an unrecorded period is simply absent from the data, never assumed to be
// an absence. Among the recorded periods: "late" counts as attended (the
// student was present, just tardy) alongside "present"; the day is
// "excused" if at least EXCUSED_THRESHOLD recorded periods were excused;
// otherwise it's "present" when attended periods are >= absent periods
// among what was recorded, and "absent" only when actually-recorded
// absences outnumber attended periods. A day with zero recorded periods
// has no status at all (status: null) rather than defaulting to absent.
// A legacy row (period is null — includes admin/management "final"
// overrides) is used as-is for that day, bypassing the period count
// entirely.

export const PERIODS_PER_DAY = 8;
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
  const recordedCount = presentCount + absentCount + lateCount + excusedCount;
  const attendedCount = presentCount + lateCount;
  const status = recordedCount === 0
    ? null
    : excusedCount >= EXCUSED_THRESHOLD
      ? 'excused'
      : (attendedCount >= absentCount ? 'present' : 'absent');
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
