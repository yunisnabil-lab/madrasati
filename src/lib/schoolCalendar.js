// The Ministry of Education academic calendar for students, 2026-2029
// (Academic-calendar-MoE2026-2028.pdf), plus the national days the school
// asked to add (Commemoration Day and National Day).
//
// School week: Saturday and Sunday are off (Friday is a short 4-period day,
// see periodsForDate in attendanceDerive.js). Dates are 'YYYY-MM-DD' local.
//
// Coverage: only dates between the first day of 2026-27 and the last day of
// 2028-29 are judged against this calendar. Anything outside that range is
// treated as an ordinary weekday, so older data isn't wrongly hidden.
// To add a year later, append to SCHOOL_YEARS and HOLIDAYS below.

export const SCHOOL_YEARS = [
  { start: '2026-08-31', end: '2027-07-02' },
  { start: '2027-08-30', end: '2028-06-30' },
  { start: '2028-08-28', end: '2029-06-29' },
];

// range is inclusive; single days use the same date for from and to
export const HOLIDAYS = [
  // 2026-2027
  { from: '2026-10-12', to: '2026-10-16', ar: 'إجازة منتصف الفصل', en: 'Mid-term break' },
  { from: '2026-11-30', to: '2026-11-30', ar: 'يوم الشهيد', en: 'Commemoration Day' },
  { from: '2026-12-02', to: '2026-12-04', ar: 'العيد الوطني', en: 'National Day' },
  { from: '2026-12-14', to: '2026-12-31', ar: 'إجازة الشتاء', en: 'Winter break' },
  { from: '2027-01-01', to: '2027-01-01', ar: 'رأس السنة الميلادية', en: "New Year's Day" },
  { from: '2027-03-08', to: '2027-03-12', ar: 'عيد الفطر', en: 'Eid Al-Fitr' },
  { from: '2027-04-05', to: '2027-04-09', ar: 'إجازة الربيع', en: 'Spring break' },
  { from: '2027-05-17', to: '2027-05-18', ar: 'عيد الأضحى', en: 'Eid Al-Adha' },
  // 2027-2028
  { from: '2027-10-04', to: '2027-10-08', ar: 'إجازة منتصف الفصل', en: 'Mid-term break' },
  { from: '2027-11-30', to: '2027-11-30', ar: 'يوم الشهيد', en: 'Commemoration Day' },
  { from: '2027-12-02', to: '2027-12-03', ar: 'العيد الوطني', en: 'National Day' },
  { from: '2027-12-13', to: '2027-12-31', ar: 'إجازة الشتاء', en: 'Winter break' },
  { from: '2028-01-01', to: '2028-01-01', ar: 'رأس السنة الميلادية', en: "New Year's Day" },
  { from: '2028-02-27', to: '2028-03-03', ar: 'عيد الفطر', en: 'Eid Al-Fitr' },
  { from: '2028-03-27', to: '2028-03-31', ar: 'إجازة الربيع', en: 'Spring break' },
  { from: '2028-05-04', to: '2028-05-07', ar: 'عيد الأضحى', en: 'Eid Al-Adha' },
  { from: '2028-05-25', to: '2028-05-25', ar: 'رأس السنة الهجرية', en: 'Hijri New Year' },
  // 2028-2029
  { from: '2028-10-16', to: '2028-10-20', ar: 'إجازة منتصف الفصل', en: 'Mid-term break' },
  { from: '2028-11-30', to: '2028-11-30', ar: 'يوم الشهيد', en: 'Commemoration Day' },
  { from: '2028-12-02', to: '2028-12-03', ar: 'العيد الوطني', en: 'National Day' },
  { from: '2028-12-11', to: '2028-12-29', ar: 'إجازة الشتاء', en: 'Winter break' },
  { from: '2029-01-01', to: '2029-01-01', ar: 'رأس السنة الميلادية', en: "New Year's Day" },
  { from: '2029-02-15', to: '2029-02-17', ar: 'عيد الفطر', en: 'Eid Al-Fitr' },
  { from: '2029-03-26', to: '2029-03-29', ar: 'إجازة الربيع', en: 'Spring break' },
  { from: '2029-04-23', to: '2029-04-27', ar: 'عيد الأضحى', en: 'Eid Al-Adha' },
  { from: '2029-05-15', to: '2029-05-15', ar: 'رأس السنة الهجرية', en: 'Hijri New Year' },
];

const COVERAGE_START = SCHOOL_YEARS[0].start;
const COVERAGE_END = SCHOOL_YEARS[SCHOOL_YEARS.length - 1].end;

// 'YYYY-MM-DD' strings compare correctly as plain strings
function inRange(d, from, to) { return d >= from && d <= to; }

// Why a date is not a school day: { kind: 'weekend' | 'holiday' | 'break', name }
// or null when it is a normal school day.
export function nonSchoolDay(dateStr, lang = 'ar') {
  if (!dateStr) return null;
  const dow = new Date(dateStr + 'T00:00:00').getDay(); // 0=Sunday, 6=Saturday
  if (dow === 0 || dow === 6) {
    return { kind: 'weekend', name: lang === 'ar' ? 'عطلة نهاية الأسبوع' : 'Weekend' };
  }
  if (dateStr < COVERAGE_START || dateStr > COVERAGE_END) return null; // outside the calendar we know
  const h = HOLIDAYS.find((x) => inRange(dateStr, x.from, x.to));
  if (h) return { kind: 'holiday', name: lang === 'ar' ? h.ar : h.en };
  const inYear = SCHOOL_YEARS.some((y) => inRange(dateStr, y.start, y.end));
  if (!inYear) return { kind: 'break', name: lang === 'ar' ? 'إجازة الصيف' : 'Summer break' };
  return null;
}

export function isSchoolDay(dateStr) {
  return nonSchoolDay(dateStr) === null;
}
