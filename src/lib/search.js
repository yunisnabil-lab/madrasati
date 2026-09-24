// Arabic letter normalization + smart student search.
// Collapses letter variants so "احمد" matches "أحمد", "ه" matches "ة", etc.

export function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[ً-ٟـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ؤئء]/g, '')
    .replace(/\s+/g, ' ');
}

// How well `student` matches the (already-trimmed) raw query, for ordering
// results. Lower is better; null means no match.
//   0  the name STARTS with the query — "عبدالله" finds the students whose
//      first name is عبدالله first
//   1  the query appears elsewhere in the name — "محمد عبدالله" comes after
//      everyone whose first name matched
//   2  matches an identifier field (email, emirates id, ...)
// Spaces are ignored when comparing names, so "عبدالله" also finds
// "عبد الله". A numeric query matches the student ID by substring.
export function studentMatchRank(student, rawQuery) {
  const q = rawQuery.trim();
  if (!q) return 0;

  if (/^\d+$/.test(q)) {
    return (student.sis_no || '').includes(q) ? 0 : null;
  }

  const nq = normalizeArabic(q).replace(/\s/g, '');
  const names = [student.name_ar, student.name_en].map((n) => normalizeArabic(n).replace(/\s/g, ''));
  if (names.some((n) => n.startsWith(nq))) return 0;
  if (names.some((n) => n.includes(nq))) return 1;

  const idFields = [student.email, student.emirates_id, student.moe_username, student.parent_email, student.sis_no];
  return idFields.some((f) => (f || '').toLowerCase().includes(q.toLowerCase())) ? 2 : null;
}

export function matchesStudentSearch(student, rawQuery) {
  return studentMatchRank(student, rawQuery) !== null;
}

// Filter + order by relevance (first-name matches first, then the rest).
// Stable: students with the same rank keep their incoming order.
export function searchStudents(list, rawQuery) {
  const q = rawQuery.trim();
  if (!q) return list;
  return list
    .map((s, i) => ({ s, i, r: studentMatchRank(s, q) }))
    .filter((x) => x.r !== null)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.s);
}
