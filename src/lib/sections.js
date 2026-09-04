// Shared utilities for working with the sections table's
// grade_name / stream / section_number columns.

const STREAM_LABELS = {
  ar: {
    General: 'عام',
    Advanced: 'متقدم',
    'Gen-3rdLanguage': 'عام - لغة ثالثة',
  },
  en: {
    General: 'General',
    Advanced: 'Advanced',
    'Gen-3rdLanguage': 'General - 3rd Language',
  },
};

const STREAM_ORDER = { General: 1, Advanced: 2, 'Gen-3rdLanguage': 3 };

export function streamLabel(stream, lang) {
  if (!stream) return '';
  const dict = STREAM_LABELS[lang] || STREAM_LABELS.ar;
  return dict[stream] || stream;
}

function streamSortValue(stream) {
  if (!stream) return 0;
  return STREAM_ORDER[stream] || 500;
}

// Sort sections: grade_order asc -> stream priority -> section_number asc
export function sortSections(sections) {
  return [...sections].sort((a, b) => {
    const g = (a.grade_order ?? 999) - (b.grade_order ?? 999);
    if (g !== 0) return g;
    const s = streamSortValue(a.stream) - streamSortValue(b.stream);
    if (s !== 0) return s;
    return (a.section_number ?? 999) - (b.section_number ?? 999);
  });
}

// Human readable label for one section row. Per the school's request, the
// section itself is shown using its raw section_name value exactly as
// stored in the database (e.g. "01/01", "02[General]/1") rather than a
// cleaned-up "Section N" — only the grade name and stream are still
// shown in friendly form alongside it. In English mode, uses grade_name_en
// when the school has filled it in; otherwise falls back to the Arabic name.
// e.g. "الصف الحادي عشر — متقدم — 11[Advanced]/1"
export function sectionLabel(section, lang) {
  if (!section) return '';
  const gradeName = (lang === 'en' && section.grade_name_en) ? section.grade_name_en : section.grade_name;
  const parts = [gradeName];
  const stLabel = streamLabel(section.stream, lang);
  if (stLabel) parts.push(stLabel);
  parts.push(section.section_name ?? '—');
  return parts.join(' — ');
}

// Build the list of distinct grades (sorted), for the first dropdown.
export function distinctGrades(sections) {
  const map = new Map();
  sections.forEach((s) => {
    if (!map.has(s.grade_name)) map.set(s.grade_name, { grade_order: s.grade_order ?? 999, grade_name_en: s.grade_name_en || null });
  });
  return [...map.entries()]
    .map(([grade_name, info]) => ({ grade_name, grade_order: info.grade_order, grade_name_en: info.grade_name_en }))
    .sort((a, b) => a.grade_order - b.grade_order);
}

// Distinct streams available within one grade (sorted). Empty array
// means that grade has no stream split (e.g. primary grades).
export function distinctStreams(sections, gradeName) {
  const set = new Set();
  sections.forEach((s) => {
    if (s.grade_name === gradeName && s.stream) set.add(s.stream);
  });
  return [...set].sort((a, b) => streamSortValue(a) - streamSortValue(b));
}

// Sections matching a grade (+ optional stream), sorted by section_number.
export function sectionsFor(sections, gradeName, stream) {
  const list = sections.filter((s) => s.grade_name === gradeName && (!stream || s.stream === stream));
  return sortSections(list);
}
