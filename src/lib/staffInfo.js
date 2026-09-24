// Cycles and subjects are lists: a teacher can teach in more than one cycle
// (and a supervisor can oversee more than one), and a teacher can teach more
// than one subject — e.g. Arabic and Drama in the first cycle. They're stored
// in the staff table's `cycles` / `subjects` array columns; the older single
// `cycle` / `subject` columns are still read as a fallback for rows created
// before the arrays existed.

export function staffCycles(s) {
  if (!s) return [];
  if (Array.isArray(s.cycles) && s.cycles.length) return s.cycles;
  return s.cycle ? [s.cycle] : [];
}

export function staffSubjects(s) {
  if (!s) return [];
  if (Array.isArray(s.subjects) && s.subjects.length) return s.subjects;
  return s.subject ? [s.subject] : [];
}

// Subjects only mean something for teachers. When someone's role changes to
// supervisor/edari/admin their subjects are kept (in case they go back to
// teaching) but hidden everywhere.
export function shownSubjects(s) {
  return s && s.role === 'recorder' ? staffSubjects(s) : [];
}

// UAE school cycles: first = grades 1–4, second = 5–8, third = 9–12.
// grade_order on the sections table is the grade number.
export function cycleForGradeOrder(order) {
  if (order == null) return null;
  if (order <= 4) return 'cycle1';
  if (order <= 8) return 'cycle2';
  return 'cycle3';
}

export function namesOf(keys, dict, lang = 'ar') {
  return keys.map((k) => dict[k] || k).join(lang === 'ar' ? '، ' : ', ');
}
