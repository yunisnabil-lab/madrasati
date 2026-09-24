// Shared logic for turning raw per-period attendance_records rows into a
// single derived status per student per day.
//
// A school day has up to PERIODS_PER_DAY (8) periods, but not every period
// is necessarily recorded on a given day (a recorder may only get through
// one or two periods, or a class may not meet every period). An unrecorded
// period is simply absent from the data, never assumed to be an absence,
// and it never changes any individual period's own recorded status
// (periods keeps each period's raw status untouched either way).
//
// Late and excused periods both count as attendance (the same as a normal
// present period). The day is decided by proportion: the student needs at
// least 5 of the 8 periods as attendance, otherwise the day is "absent";
// when fewer periods were recorded, 5/8 of the recorded periods (6 recorded
// -> at least 4). Fewer than 3 recorded periods gives no verdict
// (status: null) — a report should show the individual periods instead. A
// legacy row (period is null — includes admin/management "final" overrides)
// is used as-is for that day, bypassing all of the above entirely.
//
// lateCount/excusedCount are still tallied and returned per day (reports
// use them to show, say, "days with a late period").

export const PERIODS_PER_DAY = 8;

// The school week: Saturday and Sunday are off, and Friday is a short day of
// 4 periods (every other school day has 8). dateStr is 'YYYY-MM-DD'.
export const FRIDAY_PERIODS = 4;
export function periodsForDate(dateStr) {
  if (!dateStr) return PERIODS_PER_DAY;
  return new Date(dateStr + 'T00:00:00').getDay() === 5 ? FRIDAY_PERIODS : PERIODS_PER_DAY;
}
const REQUIRED_PERIODS = 5; // periods (of 8) a student must attend for the day to count as attended
const MIN_PERIODS_TO_DECIDE = 3; // fewer recorded periods than this -> no day verdict yet

function deriveDayFromRows(rows) {
  const legacy = rows.find((r) => r.period == null);
  if (legacy) {
    return { status: legacy.status, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0, periods: {} };
  }
  // one row per period: if the same period was saved twice for a student
  // (a double save), the later row wins instead of counting twice and
  // pushing a student over the 3-absence threshold by mistake
  const byPeriod = new Map();
  rows.forEach((r) => { if (r.period != null) byPeriod.set(r.period, r); });
  const unique = [...byPeriod.values()];
  const periods = {};
  unique.forEach((r) => { periods[r.period] = r.status; });
  const presentCount = unique.filter((r) => r.status === 'present').length;
  const absentCount = unique.filter((r) => r.status === 'absent').length;
  const lateCount = unique.filter((r) => r.status === 'late').length;
  const excusedCount = unique.filter((r) => r.status === 'excused').length;
  const recordedCount = presentCount + absentCount + lateCount + excusedCount;

  // The school's rule: a student needs at least 5 of the 8 periods as
  // attendance (present / late / excused), otherwise the day is "absent".
  // When fewer than 8 periods were recorded the same rule is applied in
  // proportion — 5/8 of the periods recorded (e.g. 6 recorded -> at least
  // 4, because 6 x 5/8 = 3.75). Compared as attended x 8 >= 5 x recorded so
  // there's no rounding.
  const attendedCount = presentCount + lateCount + excusedCount;
  let status;
  if (recordedCount < MIN_PERIODS_TO_DECIDE) {
    // one or two periods say too little about the whole day (a teacher may
    // only have recorded period 1 so far) — no verdict yet rather than a
    // misleading "absent"
    status = null;
  } else if (attendedCount * PERIODS_PER_DAY >= REQUIRED_PERIODS * recordedCount) {
    status = 'present';
  } else {
    status = 'absent';
  }

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
