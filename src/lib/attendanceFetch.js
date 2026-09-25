import { supabase } from './supabase';

// Attendance for a set of sections and a date range, in one compact answer from the
// database (supabase/attendance_compact.sql): for every student and day a short
// string of the period statuses ("PPPAPPPP" = present x3, absent, present x4) instead
// of one row per period — about 8x less data, no 1000-row paging. It is turned back
// into the same { student_id, date, status, period } records that
// attendanceDerive.js works with, so nothing else has to change.
// Returns { data: records } or { data: null } when the function isn't installed
// (the caller then falls back to the old row-by-row download).
const CODE = { P: 'present', A: 'absent', L: 'late', E: 'excused' };

export async function fetchAttendanceCompact(sectionIds, from, to) {
  const { data, error } = await supabase.rpc('attendance_compact', { p_from: from, p_to: to, p_section_ids: sectionIds });
  if (error || !data || typeof data !== 'object') return { data: null, error };
  const records = [];
  Object.entries(data).forEach(([student_id, days]) => {
    Object.entries(days).forEach(([date, s]) => {
      if (s[0] === '=') { // an old whole-day record (no period)
        records.push({ student_id, date, status: s.slice(1), period: null });
        return;
      }
      for (let i = 0; i < s.length; i++) {
        const status = CODE[s[i]];
        if (status) records.push({ student_id, date, status, period: i + 1 });
      }
    });
  });
  return { data: records, error: null };
}
