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
// present period) — a student who was late or had an approved excuse for a
// period was still there in the way that matters for the day's overall
// verdict. So the ONLY thing that can make a day read as anything other
// than "attended" is real absence: the day is "absent" as soon as at least
// ABSENT_THRESHOLD recorded periods were absent — decided the moment that
// threshold is hit, regardless of how many periods are still unrecorded
// (e.g. period 1 recorded absent, periods 2-8 not recorded yet still only
// needs 3 total absences to call the day "absent"). Short of that
// threshold, the day is only ever called "present" once ALL
// PERIODS_PER_DAY periods have actually been recorded — a single period
// (or any number short of the full day) marked present/late/excused must
// NOT make the whole day read "present" while the rest of the day was
// simply never recorded. Short of both, the day has no status at all
// (status: null, the same "not recorded" state as a day with zero periods
// recorded) rather than guessing — a report should show the day's
// individual periods instead of a misleading total. A legacy row (period
// is null — includes admin/management "final" overrides) is used as-is
// for that day, bypassing all of the above entirely.
//
// lateCount/excusedCount are still tallied and returned per day (reports
// use them to show, say, "days with a late period" the same way they
// already do for lateness) — they just no longer produce their own
// day-level verdict, matching how "late" already worked.

export const PERIODS_PER_DAY = 8;
const ABSENT_THRESHOLD = 3;

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

  let status;
  if (absentCount >= ABSENT_THRESHOLD) {
    status = 'absent';
  } else if (recordedCount < PERIODS_PER_DAY) {
    // Not enough absences to call it yet, and the day isn't fully
    // recorded — too early to call it "present" just because the periods
    // recorded so far happen to be clean.
    status = null;
  } else {
    // All 8 periods recorded and fewer than 3 absent: present, late and
    // excused periods all count as attendance, so this is "present".
    status = 'present';
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
