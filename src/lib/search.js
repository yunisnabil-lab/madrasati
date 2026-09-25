// Arabic letter normalization + smart student search.
// Collapses letter variants so "احمد" matches "أحمد", "ه" matches "ة", etc.

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> 0-9, so a student number
// typed on an Arabic keyboard still matches.
function latinDigits(text) {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizeArabic(text) {
  if (!text) return '';
  return latinDigits(String(text))
    .toLowerCase()
    .trim()
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '') // invisible direction / zero-width marks
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel, dagger alef, tatweel
    .replace(/[أإآٱا]/g, 'ا') // أ إ آ ٱ ا -> ا
    .replace(/[ةهہە]/g, 'ه') // ة ه -> ه
    .replace(/[ىيیے]/g, 'ي') // ى ي ی -> ي
    .replace(/ک/g, 'ك') // ک -> ك
    .replace(/ؤ/g, 'و') // ؤ -> و  (مؤمن = مومن)
    .replace(/ئ/g, 'ي') // ئ -> ي  (عائشة = عايشه)
    .replace(/ء/g, '') // ء alone: dropped
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
  const q = latinDigits(rawQuery.trim());
  if (!q) return 0;

  if (/^\d+$/.test(q)) {
    return (student.sis_no || '').includes(q) ? 0 : null;
  }

  const nq = normalizeArabic(q).replace(/\s/g, '');
  const names = [student.name_ar, student.name_en].map((n) => normalizeArabic(n).replace(/\s/g, ''));
  if (names.some((n) => n.startsWith(nq))) return 0;
  if (names.some((n) => n.includes(nq))) return 1;
  // several words typed: every word must appear in the name, in any order
  // ("خليل احمد" finds "خليل ابراهيم احمد ...")
  const words = normalizeArabic(q).split(' ').filter(Boolean);
  if (words.length > 1 && names.some((n) => words.every((w) => n.includes(w)))) return 1;

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
