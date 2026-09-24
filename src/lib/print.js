import { sortSections, sectionLabel } from './sections';

// Section label for print headings: the section name ("5/[General]09") is
// isolated as left-to-right so its digits, slash and brackets keep their order
// inside an Arabic line instead of being scrambled by the bidi algorithm.
export function printSectionLabel(section, lang) {
  const base = sectionLabel(section, lang);
  const name = section?.section_name;
  if (!base || !name || !base.endsWith(String(name))) return base;
  return `${base.slice(0, base.length - String(name).length)}⁦${name}⁩`;
}

// Prints the current page with a meaningful suggested filename.
//
// A browser's "Save as PDF" print destination names the file after
// document.title — but the app's <title> is the same on every page, so every
// printed report would land on disk under that same name. This sets a real,
// specific title just for the print, then restores the previous one once
// printing is done (or dismissed).
export function printWithTitle(title) {
  const prev = document.title;
  document.title = title;
  const restore = () => {
    document.title = prev;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}

// File / PDF name: the non-empty parts joined with " - ", with characters a
// file name can't hold ("/" in "04/03", ":" ...) replaced.
// e.g. reportName('تقرير الغياب اليومي', 'الصف الرابع 04/03', 'الاثنين 2026-08-24')
export function reportName(...parts) {
  return parts
    .filter(Boolean)
    .map((p) => String(p).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' - ');
}

export function weekdayName(dateStr, lang) {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { weekday: 'long' }).format(new Date(`${dateStr}T00:00:00`));
}

// "2026-08-01 إلى 2026-08-31", or just the date when both ends are the same.
export function rangeLabel(lang, from, to) {
  if (!from && !to) return '';
  if (!from || !to || from === to) return from || to;
  return `${from} ${lang === 'ar' ? 'إلى' : 'to'} ${to}`;
}

// Today, written out ("الثلاثاء 25 أغسطس 2026"), Latin digits.
export function printedNow(lang) {
  return new Date().toLocaleDateString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Splits rows into one group per section, in the school's section order.
// labelOf(sectionId, rowsOfThatSection) -> the heading text for the group.
export function groupRowsBySection(rows, sections, sectionIdOf, labelOf) {
  const order = new Map(sortSections(sections).map((s, i) => [s.id, i]));
  const map = new Map();
  rows.forEach((r) => {
    const id = sectionIdOf(r);
    if (!map.has(id)) map.set(id, { id, rows: [] });
    map.get(id).rows.push(r);
  });
  return [...map.values()]
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    .map((g) => ({ label: labelOf(g.id, g.rows), rows: g.rows }));
}
