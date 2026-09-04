// Arabic letter normalization + smart student search.
// Collapses letter variants so "احمد" matches "أحمد", "ه" matches "ة", etc.

export function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ؤئء]/g, '')
    .replace(/\s+/g, ' ');
}

// Returns true if `student` matches the (already-trimmed) raw query.
// Rules:
// - a numeric-looking query matches the student ID (sis_no) by substring
// - otherwise the (normalized) query must match the START of the
//   student's full name (ar or en) — so searching "احمد" finds "أحمد محمد
//   علي" but not "محمد أحمد سعيد" (that would need "محمد"), and typing a
//   full name like "احمد محمد" still matches correctly since we compare
//   against the whole name, not just its first word
// - it also matches identifier fields (email, emirates_id, moe_username,
//   parent_email) via substring, since those aren't names
export function matchesStudentSearch(student, rawQuery) {
  const q = rawQuery.trim();
  if (!q) return true;

  const isNumericQuery = /^\d+$/.test(q);
  if (isNumericQuery) {
    return (student.sis_no || '').includes(q);
  }

  const nq = normalizeArabic(q);

  if (normalizeArabic(student.name_ar).startsWith(nq)) return true;
  if (normalizeArabic(student.name_en).startsWith(nq)) return true;

  const idFields = [student.email, student.emirates_id, student.moe_username, student.parent_email, student.sis_no];
  return idFields.some((f) => (f || '').toLowerCase().includes(q.toLowerCase()));
}
